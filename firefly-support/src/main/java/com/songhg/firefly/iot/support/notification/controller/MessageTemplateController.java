package com.songhg.firefly.iot.support.notification.controller;

import com.baomidou.mybatisplus.core.metadata.IPage;
import com.songhg.firefly.iot.common.result.R;
import com.songhg.firefly.iot.common.security.RequiresPermission;
import com.songhg.firefly.iot.support.notification.convert.MessageTemplateConvert;
import com.songhg.firefly.iot.support.notification.dto.messagetemplate.MessageTemplateCreateDTO;
import com.songhg.firefly.iot.support.notification.dto.messagetemplate.MessageTemplateQueryDTO;
import com.songhg.firefly.iot.support.notification.dto.messagetemplate.MessageTemplateUpdateDTO;
import com.songhg.firefly.iot.support.notification.dto.messagetemplate.MessageTemplateVO;
import com.songhg.firefly.iot.support.notification.dto.messagetemplate.TemplatePreviewDTO;
import com.songhg.firefly.iot.support.notification.dto.messagetemplate.TemplateRenderDTO;
import com.songhg.firefly.iot.support.notification.entity.MessageTemplate;
import com.songhg.firefly.iot.support.notification.service.MessageTemplateService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@Tag(name = "消息模板", description = "消息模板 CRUD")
@RestController
@RequestMapping("/api/v1/message-templates")
@RequiredArgsConstructor
public class MessageTemplateController {

    private final MessageTemplateService templateService;

    @PostMapping
    @RequiresPermission("message-template:create")
    @Operation(summary = "创建消息模板")
    public R<MessageTemplateVO> create(@Valid @RequestBody MessageTemplateCreateDTO dto) {
        MessageTemplate template = MessageTemplateConvert.INSTANCE.toEntity(dto);
        return R.ok(MessageTemplateConvert.INSTANCE.toVO(templateService.create(template)));
    }

    @PostMapping("/list")
    @RequiresPermission("message-template:read")
    @Operation(summary = "分页查询消息模板")
    public R<IPage<MessageTemplateVO>> list(@RequestBody MessageTemplateQueryDTO query) {
        return R.ok(templateService.list(query).convert(MessageTemplateConvert.INSTANCE::toVO));
    }

    @GetMapping("/{id}")
    @RequiresPermission("message-template:read")
    @Operation(summary = "获取消息模板详情")
    public R<MessageTemplateVO> getById(@Parameter(description = "模板编号", required = true) @PathVariable Long id) {
        return R.ok(MessageTemplateConvert.INSTANCE.toVO(templateService.getById(id)));
    }

    @GetMapping("/by-code")
    @RequiresPermission("message-template:read")
    @Operation(summary = "按编码查询消息模板")
    public R<MessageTemplateVO> getByCode(@Parameter(description = "模板编码", required = true) @RequestParam String code) {
        return R.ok(MessageTemplateConvert.INSTANCE.toVO(templateService.getByCode(code)));
    }

    @GetMapping("/by-channel")
    @RequiresPermission("message-template:read")
    @Operation(summary = "按渠道查询消息模板")
    public R<List<MessageTemplateVO>> listByChannel(@Parameter(description = "渠道", required = true) @RequestParam String channel) {
        return R.ok(templateService.listByChannel(channel).stream().map(MessageTemplateConvert.INSTANCE::toVO).toList());
    }

    @PutMapping("/{id}")
    @RequiresPermission("message-template:update")
    @Operation(summary = "更新消息模板")
    public R<MessageTemplateVO> update(@Parameter(description = "模板编号", required = true) @PathVariable Long id, @Valid @RequestBody MessageTemplateUpdateDTO dto) {
        MessageTemplate template = templateService.getById(id);
        MessageTemplateConvert.INSTANCE.updateEntity(dto, template);
        return R.ok(MessageTemplateConvert.INSTANCE.toVO(templateService.update(id, template)));
    }

    @DeleteMapping("/{id}")
    @RequiresPermission("message-template:delete")
    @Operation(summary = "删除消息模板")
    public R<Void> delete(@Parameter(description = "模板编号", required = true) @PathVariable Long id) {
        templateService.delete(id);
        return R.ok();
    }

    @PutMapping("/{id}/toggle")
    @RequiresPermission("message-template:update")
    @Operation(summary = "启用/禁用消息模板")
    public R<Void> toggleEnabled(@Parameter(description = "模板编号", required = true) @PathVariable Long id, @Parameter(description = "启用或禁用") @RequestParam boolean enabled) {
        templateService.toggleEnabled(id, enabled);
        return R.ok();
    }

    @PostMapping("/render")
    @RequiresPermission("message-template:read")
    @Operation(summary = "渲染模板")
    public R<String> render(@Valid @RequestBody TemplateRenderDTO dto) {
        return R.ok(templateService.renderByCode(dto.getCode(), dto.getVariables()));
    }

    @PostMapping("/preview")
    @RequiresPermission("message-template:read")
    @Operation(summary = "预览模板")
    public R<String> preview(@Valid @RequestBody TemplatePreviewDTO dto) {
        return R.ok(templateService.render(dto.getContent(), dto.getVariables()));
    }
}
