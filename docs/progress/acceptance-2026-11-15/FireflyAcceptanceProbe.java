import com.fasterxml.jackson.databind.ObjectMapper;
import com.songhg.firefly.iot.api.client.*;
import com.songhg.firefly.iot.api.dto.AsyncTaskVO;
import com.songhg.firefly.iot.common.constant.AuthConstants;
import com.songhg.firefly.iot.common.context.*;
import com.songhg.firefly.iot.common.enums.DataScopeType;
import com.songhg.firefly.iot.common.exception.BizException;
import com.songhg.firefly.iot.common.message.DeviceMessage;
import com.songhg.firefly.iot.common.mybatis.*;
import com.songhg.firefly.iot.common.mybatis.scope.*;
import com.songhg.firefly.iot.common.result.R;
import com.songhg.firefly.iot.common.security.*;
import com.songhg.firefly.iot.device.dto.device.DeviceImportDTO;
import com.songhg.firefly.iot.device.entity.Device;
import com.songhg.firefly.iot.device.entity.DeviceTelemetry;
import com.songhg.firefly.iot.device.mapper.*;
import com.songhg.firefly.iot.device.service.*;
import com.songhg.firefly.iot.gateway.filter.AuthGlobalFilter;
import com.songhg.firefly.iot.rule.dataforward.executor.*;
import com.songhg.firefly.iot.rule.dataforward.support.ForwardTemplateRenderer;
import com.songhg.firefly.iot.rule.service.*;
import com.songhg.firefly.iot.system.service.PermissionService;
import com.songhg.firefly.iot.system.consumer.PermissionEventConsumer;
import com.songhg.firefly.iot.system.mapper.RolePermissionMapper;
import io.jsonwebtoken.Jwts;
import org.springframework.data.redis.core.*;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.mock.http.server.reactive.MockServerHttpRequest;
import org.springframework.mock.web.server.MockServerWebExchange;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.web.reactive.function.client.WebClient;
import reactor.core.publisher.Mono;
import java.lang.reflect.*;
import java.security.*;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

public class FireflyAcceptanceProbe {
    private static final ObjectMapper MAPPER = new ObjectMapper();
    private static int passed;
    private static int failed;
    @RequiresPermission("device:delete") public void protectedOperation() {}

    public static void main(String[] args) throws Exception {
        gateway();
        permissions();
        internalAuth();
        expressions();
        brokerKeys();
        scope();
        asyncImport();
        consumer();
        telemetry();
        parameterParsing();
        AppContextHolder.clear();
        System.out.println("SUMMARY passed=" + passed + " failed=" + failed);
        if (failed != 0) System.exit(1);
    }

    private static void check(String name, boolean result) {
        System.out.println((result ? "PASS " : "FAIL ") + name);
        if (result) passed++; else failed++;
    }
    private static void field(Object target, String name, Object value) throws Exception {
        Field property = target.getClass().getDeclaredField(name);
        property.setAccessible(true);
        property.set(target, value);
    }
    private static Object invoke(Object target, String name, Class<?>[] types, Object... args) throws Exception {
        Method method = target.getClass().getDeclaredMethod(name, types);
        method.setAccessible(true);
        try { return method.invoke(target, args); }
        catch (InvocationTargetException failure) {
            if (failure.getCause() instanceof Exception cause) throw cause;
            throw failure;
        }
    }
    private static <Value> Value construct(Class<Value> type) throws Exception {
        Constructor<?> constructor = type.getConstructors()[0];
        Object[] parameters = Arrays.stream(constructor.getParameterTypes())
                .map(parameter -> parameter == ObjectMapper.class ? MAPPER : null).toArray();
        return type.cast(constructor.newInstance(parameters));
    }
    private static void context() {
        AppContextHolder.clear();
        AppContextHolder.setTenantId(1L);
        AppContextHolder.setUserId(7L);
    }

    private static void gateway() throws Exception {
        ReactiveStringRedisTemplate redis = mock(ReactiveStringRedisTemplate.class);
        ReactiveValueOperations<String, String> values = mock(ReactiveValueOperations.class);
        when(redis.hasKey(anyString())).thenReturn(Mono.just(false));
        when(redis.opsForValue()).thenReturn(values);
        AuthGlobalFilter filter = new AuthGlobalFilter(redis, WebClient.builder());
        for (String invalid : List.of("", "bad-key")) {
            field(filter, "publicKeyBase64", invalid);
            boolean rejected = false;
            try { filter.init(); } catch (IllegalStateException expected) { rejected = true; }
            check("AUD-001 rejects " + (invalid.isEmpty() ? "missing" : "invalid") + " key", rejected);
        }
        KeyPairGenerator generator = KeyPairGenerator.getInstance("RSA");
        generator.initialize(2048);
        KeyPair pair = generator.generateKeyPair();
        field(filter, "publicKeyBase64", Base64.getEncoder().encodeToString(pair.getPublic().getEncoded()));
        filter.init();
        String token = Jwts.builder().subject("7").claim(AuthConstants.JWT_CLAIM_TENANT_ID, "1")
                .issuedAt(new Date(100000L)).expiration(new Date(System.currentTimeMillis() + 60000))
                .signWith(pair.getPrivate()).compact();
        for (String marker : List.of("absent", "50", "200")) {
            when(values.get(anyString())).thenReturn(marker.equals("absent") ? Mono.empty() : Mono.just(marker));
            AtomicInteger forwarded = new AtomicInteger();
            AtomicBoolean clean = new AtomicBoolean();
            MockServerWebExchange exchange = MockServerWebExchange.from(MockServerHttpRequest.get("/DEVICE/api/v1/devices/1")
                    .header("Authorization", "Bearer " + token)
                    .header(AuthConstants.HEADER_APP_KEY_ID, "123")
                    .header(AuthConstants.HEADER_GRANTED_PERMISSIONS, "*")
                    .header(AuthConstants.HEADER_INTERNAL_TOKEN, "forged"));
            filter.filter(exchange, next -> Mono.fromRunnable(() -> {
                forwarded.incrementAndGet();
                clean.set(next.getRequest().getHeaders().getFirst(AuthConstants.HEADER_GRANTED_PERMISSIONS) == null
                        && next.getRequest().getHeaders().getFirst(AuthConstants.HEADER_APP_KEY_ID) == null
                        && next.getRequest().getHeaders().getFirst(AuthConstants.HEADER_INTERNAL_TOKEN) == null
                        && "7".equals(next.getRequest().getHeaders().getFirst(AuthConstants.HEADER_USER_ID)));
            })).block();
            boolean revoked = marker.equals("200");
            check("AUD-005 revoke=" + marker + " forwards=" + forwarded.get(), forwarded.get() == (revoked ? 0 : 1));
            if (!revoked) check("AUD-002 cleaned forged headers marker=" + marker, clean.get());
            else check("AUD-005 revoked returns 401", exchange.getResponse().getStatusCode().value() == 401);
        }
        when(values.get(anyString())).thenReturn(Mono.empty());
        String expired = Jwts.builder().subject("7").expiration(new Date(100000L)).signWith(pair.getPrivate()).compact();
        String forged = Jwts.builder().subject("7").signWith(generator.generateKeyPair().getPrivate()).compact();
        for (String invalidToken : List.of("unsigned.invalid.invalid", expired, forged)) {
            AtomicInteger forwarded = new AtomicInteger();
            MockServerWebExchange exchange = MockServerWebExchange.from(MockServerHttpRequest.get("/DEVICE/api/v1/devices")
                    .header("Authorization", "Bearer " + invalidToken));
            filter.filter(exchange, next -> Mono.fromRunnable(forwarded::incrementAndGet)).block();
            check("AUD-001 malformed/expired/wrong-signature rejected", forwarded.get() == 0
                    && exchange.getResponse().getStatusCode().value() == 401);
        }
        AtomicBoolean clean = new AtomicBoolean();
        filter.filter(MockServerWebExchange.from(MockServerHttpRequest.get("/SYSTEM/api/v1/auth/login")
                .header(AuthConstants.HEADER_USER_ID, "7").header(AuthConstants.HEADER_INTERNAL_TOKEN, "forged")),
                next -> Mono.fromRunnable(() -> clean.set(next.getRequest().getHeaders().getFirst(AuthConstants.HEADER_USER_ID) == null
                        && next.getRequest().getHeaders().getFirst(AuthConstants.HEADER_INTERNAL_TOKEN) == null))).block();
        check("AUD-002 whitelist strips internal headers", clean.get());
        AtomicInteger forwarded = new AtomicInteger();
        MockServerWebExchange internal = MockServerWebExchange.from(MockServerHttpRequest.get("/DEVICE/api/v1/internal/devices/1")
                .header("Authorization", "Bearer " + token));
        filter.filter(internal, next -> Mono.fromRunnable(forwarded::incrementAndGet)).block();
        check("AUD-004 gateway rejects internal path", forwarded.get() == 0 && internal.getResponse().getStatusCode().value() == 404);
    }

    private static boolean permits(SecurityAspect aspect) throws Exception {
        RequiresPermission permission = FireflyAcceptanceProbe.class.getMethod("protectedOperation").getAnnotation(RequiresPermission.class);
        try { aspect.checkPermission(null, permission); return true; }
        catch (BizException expected) { return false; }
    }
    private static void permissions() throws Exception {
        context();
        SecurityAspect aspect = new SecurityAspect();
        check("AUD-003 no checker or redis denied", !permits(aspect));
        StringRedisTemplate redis = mock(StringRedisTemplate.class);
        SetOperations<String, String> sets = mock(SetOperations.class);
        AtomicReference<Set<String>> storage = new AtomicReference<>(Set.of());
        when(redis.opsForSet()).thenReturn(sets);
        when(sets.members(anyString())).thenAnswer(call -> storage.get());
        when(sets.add(anyString(), any(String[].class))).thenAnswer(call -> {
            storage.set(Set.of("device:delete")); return 1L;
        });
        when(redis.delete(anyString())).thenAnswer(call -> { storage.set(Set.of()); return true; });
        field(aspect, "redisTemplate", redis);
        check("AUD-003 empty redis denied", !permits(aspect));
        RolePermissionMapper mapper = mock(RolePermissionMapper.class);
        when(mapper.findPermissionsByUserId(7L)).thenReturn(Set.of("device:delete"));
        PermissionService service = new PermissionService(mapper, redis);
        service.getUserPermissions(7L);
        check("AUD-003 populated redis allows permission", permits(aspect));
        new PermissionEventConsumer(redis, MAPPER).onPermissionEvent("{\"action\":\"PERMISSIONS_CHANGED\",\"roleId\":2,\"affectedUserIds\":[7]}");
        service.getUserPermissions(7L);
        check("AUD-003 authorized user works after permission invalidation and system reread", permits(aspect));
        AppContextHolder.clear();
    }

    private static void internalAuth() {
        InternalAuthProperties properties = new InternalAuthProperties();
        properties.setToken("ephemeral-probe-token");
        InternalAccessInterceptor interceptor = new InternalAccessInterceptor(properties);
        for (String token : List.of("", "wrong", "ephemeral-probe-token")) {
            MockHttpServletRequest request = new MockHttpServletRequest("GET", "/api/v1/internal/devices/1");
            request.addHeader(AuthConstants.HEADER_INTERNAL_TOKEN, token);
            check("AUD-004 internal token " + (token.isEmpty() ? "missing" : token.equals("wrong") ? "wrong" : "valid"),
                    interceptor.preHandle(request, new MockHttpServletResponse(), new Object()) == token.equals("ephemeral-probe-token"));
        }
        DeviceService devices = mock(DeviceService.class);
        StringRedisTemplate redis = mock(StringRedisTemplate.class);
        ValueOperations<String, String> values = mock(ValueOperations.class);
        when(redis.opsForValue()).thenReturn(values);
        com.songhg.firefly.iot.api.dto.DeviceBasicVO device = new com.songhg.firefly.iot.api.dto.DeviceBasicVO();
        device.setId(10L); device.setTenantId(1L); device.setProductId(200L);
        when(devices.getDeviceBasic(10L)).thenReturn(device);
        var controller = new com.songhg.firefly.iot.device.controller.InternalDeviceAuthController(null, null, devices, redis);
        check("AUD-004 owned device token issued", controller.issueToken(10L, 1L, 200L, 60).getData() != null);
        boolean denied = false;
        try { controller.issueToken(10L, 2L, 200L, 60); } catch (BizException expected) { denied = true; }
        check("AUD-004 cross tenant token denied", denied);
        denied = false;
        try { controller.issueToken(10L, 1L, 201L, 60); } catch (BizException expected) { denied = true; }
        check("AUD-004 mismatched product token denied", denied);
        denied = false;
        try { controller.issueToken(10L, 1L, 200L, 86401); } catch (BizException expected) { denied = true; }
        check("AUD-004 excessive token ttl denied", denied);
    }

    private static void expressions() throws Exception {
        Object[] targets = {construct(RuleRuntimeService.class), construct(AlarmRuntimeService.class), new ForwardTemplateRenderer(MAPPER)};
        String[] methods = {"evaluateValue", "evaluateExpression", "evaluate"};
        Map<String, Object> values = Map.of("payload", Map.of("temperature", 30));
        for (int index = 0; index < targets.length; index++) {
            Object result = invoke(targets[index], methods[index], new Class<?>[]{String.class, Map.class}, "payload.temperature > 20", values);
            check("AUD-006 normal expression " + targets[index].getClass().getSimpleName(), Boolean.TRUE.equals(result));
            for (String expression : List.of("T(java.lang.System).getProperty('java.version')", "new java.lang.String('probe')", "payload.getClass()")) {
                boolean rejected = false;
                try { invoke(targets[index], methods[index], new Class<?>[]{String.class, Map.class}, expression, values); }
                catch (org.springframework.expression.EvaluationException expected) { rejected = true; }
                check("AUD-006 forbidden expression " + targets[index].getClass().getSimpleName() + " " + expression, rejected);
            }
        }
    }

    private static void brokerKeys() throws Exception {
        MqttForwardExecutor mqtt = new MqttForwardExecutor(MAPPER, new ForwardTemplateRenderer(MAPPER));
        Class<?>[] mqttTypes = {Long.class, String.class, String.class, String.class, String.class};
        Object firstMqtt = invoke(mqtt, "cacheKey", mqttTypes, 1L, "tcp://probe.invalid:1883", "prefix", "user", "first");
        check("AUD-008 mqtt tenant isolation", !firstMqtt.equals(invoke(mqtt, "cacheKey", mqttTypes, 2L, "tcp://probe.invalid:1883", "prefix", "user", "first")));
        check("AUD-008 mqtt credential isolation", !firstMqtt.equals(invoke(mqtt, "cacheKey", mqttTypes, 1L, "tcp://probe.invalid:1883", "prefix", "user", "second")));
        AmqpForwardExecutor amqp = new AmqpForwardExecutor(MAPPER, new ForwardTemplateRenderer(MAPPER));
        Class<?>[] amqpTypes = {Long.class, String.class, int.class, String.class, String.class, String.class};
        Object firstAmqp = invoke(amqp, "cacheKey", amqpTypes, 1L, "probe.invalid", 5672, "/", "user", "first");
        check("AUD-008 amqp tenant isolation", !firstAmqp.equals(invoke(amqp, "cacheKey", amqpTypes, 2L, "probe.invalid", 5672, "/", "user", "first")));
        check("AUD-008 amqp credential isolation", !firstAmqp.equals(invoke(amqp, "cacheKey", amqpTypes, 1L, "probe.invalid", 5672, "/", "user", "second")));
    }

    private static DataScopeContext resolvedScope(DataScopeType type) {
        DataScopeUserRoleMapper userRoles = mock(DataScopeUserRoleMapper.class);
        DataScopeRoleMapper roles = mock(DataScopeRoleMapper.class);
        DataScopeDeviceMapper devices = mock(DataScopeDeviceMapper.class);
        DataScopeProductMapper products = mock(DataScopeProductMapper.class);
        DataScopeDeviceGroupMemberMapper members = mock(DataScopeDeviceGroupMemberMapper.class);
        DataScopeUserRoleEntity membership = new DataScopeUserRoleEntity(); membership.setRoleId(2L);
        when(userRoles.selectList(any())).thenReturn(List.of(membership));
        DataScopeRoleEntity role = new DataScopeRoleEntity(); role.setDataScope(type);
        DataScopeConfig config = new DataScopeConfig(); config.setProjectIds(List.of(100L)); config.setGroupIds(List.of("3"));
        role.setDataScopeConfig(config); when(roles.selectList(any())).thenReturn(List.of(role));
        DataScopeDeviceGroupMemberEntity member = new DataScopeDeviceGroupMemberEntity(); member.setDeviceId(10L);
        when(members.selectList(any())).thenReturn(List.of(member));
        DataScopeDeviceEntity device = new DataScopeDeviceEntity(); device.setId(10L); device.setProjectId(100L); device.setProductId(200L);
        when(devices.selectList(any())).thenReturn(List.of(device)); when(products.selectList(any())).thenReturn(List.of());
        return new DatabaseDataScopeResolver(userRoles, roles, devices, products, members).resolve(7L, 1L);
    }
    private static void scope() throws Exception {
        DataScopeContext group = resolvedScope(DataScopeType.GROUP);
        check("AUD-010 group does not grant parent project or product", group.getProjectIds().isEmpty() && group.getProductIds().isEmpty() && group.getDeviceIds().equals(List.of(10L)));
        DataScopeContext project = resolvedScope(DataScopeType.PROJECT);
        System.out.println("OBSERVATION project=" + project.getProjectIds() + " product=" + project.getProductIds() + " device=" + project.getDeviceIds());
        project.setProjectColumn("project_id"); project.setDeviceColumn("id"); project.setProductColumn(""); project.setGroupColumn("");
        String sql = (String) invoke(new DataScopeInterceptor(), "appendDataScopeCondition", new Class<?>[]{String.class, DataScopeContext.class},
                "SELECT * FROM devices WHERE status = 'ACTIVE' OR status = 'INACTIVE'", project);
        System.out.println("OBSERVATION scopedSql=" + sql);
        check("AUD-009 scope IN and OR parenthesized", sql.contains("IN (100)") && sql.contains("IN (10)") && sql.contains("(status = 'ACTIVE' OR status = 'INACTIVE') AND ("));
        DeviceMapper devices = mock(DeviceMapper.class);
        Device outside = new Device(); outside.setId(11L); outside.setTenantId(1L); outside.setProjectId(101L); outside.setProductId(200L); outside.setDeviceSecret("synthetic-secret");
        when(devices.selectById(11L)).thenReturn(outside);
        DeviceService service = new DeviceService(devices, null, null, null, null, null, null, null, (user, tenant) -> project);
        context();
        boolean denied = false;
        try { service.getDeviceSecret(11L); } catch (BizException expected) { denied = true; }
        check("AUD-011 other project same product secret denied", denied);
        outside.setProductId(201L);
        denied = false;
        try { service.getDeviceSecret(11L); } catch (BizException expected) { denied = true; }
        check("AUD-011 other project other product secret denied", denied);
        AppContextHolder.clear();
    }

    private static void asyncImport() throws Exception {
        AsyncTaskClient tasks = mock(AsyncTaskClient.class); FileClient files = mock(FileClient.class);
        AsyncTaskVO task = new AsyncTaskVO(); task.setId(5L); when(tasks.createTask(any())).thenReturn(R.ok(task));
        AtomicReference<Runnable> queued = new AtomicReference<>();
        AtomicReference<String> worker = new AtomicReference<>();
        AtomicBoolean correctContext = new AtomicBoolean();
        when(files.getPresignedUrl(anyString())).thenAnswer(call -> {
            worker.set(Thread.currentThread().getName());
            correctContext.set(Objects.equals(AppContextHolder.getTenantId(), 1L) && Objects.equals(AppContextHolder.getUserId(), 7L));
            return null;
        });
        DeviceImportService service = new DeviceImportService(mock(DeviceService.class), files, tasks, new ImportTaskDispatcher(queued::set));
        DeviceImportDTO request = new DeviceImportDTO(); request.setFileKey("synthetic-file"); request.setFileFormat("CSV");
        context(); Long taskId = service.registerImportTask(request);
        check("AUD-012 registration queues without parsing", taskId == 5L && queued.get() != null && worker.get() == null);
        Thread thread = new Thread(queued.get(), "acceptance-import-worker"); thread.start(); thread.join(5000);
        check("AUD-012 executes on worker with user and tenant", "acceptance-import-worker".equals(worker.get()) && correctContext.get() && !thread.isAlive());
        worker.set(null);
        when(tasks.updateProgress(anyLong(), anyInt())).thenReturn(R.ok(false));
        service.executeImport(5L, request, 1L, 7L);
        check("AUD-012 worker stops when task progress update is rejected", worker.get() == null);
        AppContextHolder.clear();
    }

    private static void consumer() throws Exception {
        MessageRouterService failingRouter = mock(MessageRouterService.class);
        doThrow(new IllegalStateException("synthetic database failure")).when(failingRouter).routeUpstream(any());
        DeviceMessageConsumer consumer = new DeviceMessageConsumer(MAPPER, failingRouter);
        boolean thrown = false;
        try { consumer.onPropertyReport("{\"tenantId\":1,\"deviceId\":2,\"type\":\"PROPERTY_REPORT\"}"); }
        catch (RuntimeException expected) { thrown = true; }
        check("AUD-013 listener propagates router failure", thrown);
        KafkaTemplate<String, String> kafka = mock(KafkaTemplate.class);
        when(kafka.send(anyString(), anyString(), anyString())).thenReturn(CompletableFuture.failedFuture(new IllegalStateException("synthetic broker failure")));
        DeviceMessageProducer producer = new DeviceMessageProducer(kafka, MAPPER);
        MessageRouterService router = new MessageRouterService(mock(DeviceShadowService.class), mock(DeviceDataService.class), mock(DeviceService.class), mock(DeviceLocationService.class), producer, null);
        DeviceMessageConsumer actualConsumer = new DeviceMessageConsumer(MAPPER, router);
        thrown = false;
        try { actualConsumer.onPropertyReport("{\"messageId\":\"probe-message\",\"timestamp\":1700000000000,\"tenantId\":1,\"deviceId\":2,\"type\":\"PROPERTY_REPORT\",\"payload\":{\"temperature\":30}}"); }
        catch (RuntimeException expected) { thrown = true; }
        verify(kafka).send(anyString(), anyString(), anyString());
        check("AUD-013 downstream broker failure reaches listener container", thrown);
    }

    private static void telemetry() {
        DeviceMapper devices = mock(DeviceMapper.class);
        DeviceTelemetryMapper telemetry = mock(DeviceTelemetryMapper.class);
        List<DeviceTelemetry> records = new ArrayList<>();
        doAnswer(call -> { records.addAll(call.getArgument(0)); return null; }).when(telemetry).batchInsert(anyList());
        DeviceDataService service = new DeviceDataService(telemetry, null, null, devices, MAPPER);
        for (long deviceId : List.of(10L, 11L)) {
            Device device = new Device(); device.setId(deviceId); device.setTenantId(1L); device.setProductId(200L);
            when(devices.selectByIdIgnoreTenant(deviceId)).thenReturn(device);
            DeviceMessage message = DeviceMessage.builder().tenantId(1L).deviceId(deviceId).messageId("1")
                    .timestamp(1700000000000L).type(DeviceMessage.MessageType.PROPERTY_REPORT).payload(Map.of("temperature", 30)).build();
            service.writeTelemetryFromMessage(message);
        }
        DeviceTelemetry first = records.get(0); DeviceTelemetry second = records.get(1);
        boolean sameUniqueKey = Objects.equals(first.getMessageId(), second.getMessageId())
                && Objects.equals(first.getProperty(), second.getProperty()) && Objects.equals(first.getTs(), second.getTs());
        check("AUD-013 telemetry dedup key distinguishes devices", !sameUniqueKey);
        System.out.println("OBSERVATION telemetry records=" + records.size() + " distinctDevices=" + !first.getDeviceId().equals(second.getDeviceId()) + " sameSqlUniqueKey=" + sameUniqueKey);
    }

    private static void parameterParsing() {
        FileClient files = mock(FileClient.class); AsyncTaskClient tasks = mock(AsyncTaskClient.class);
        ImportTaskDispatcher dispatcher = mock(ImportTaskDispatcher.class);
        AtomicReference<String> parsingThread = new AtomicReference<>();
        when(files.getPresignedUrl(anyString())).thenAnswer(call -> { parsingThread.set(Thread.currentThread().getName()); return null; });
        ThingModelImportService service = new ThingModelImportService(null, files, tasks, MAPPER, null, dispatcher);
        try { service.parseParameterRows("synthetic-file", "CSV"); } catch (BizException expected) { }
        check("AUD-014 parameter import does not perform file I/O on request thread", parsingThread.get() == null);
        verifyNoInteractions(tasks, dispatcher);
        System.out.println("OBSERVATION parameterImport callerThread=" + Thread.currentThread().getName().equals(parsingThread.get()) + " taskRegistrations=0");
    }
}
