# ============================================================
# 通用 Dockerfile — 适用于所有 firefly-* 微服务
# 构建时通过 --build-arg MODULE=firefly-xxx 指定模块
# ============================================================
FROM eclipse-temurin:21-jre-alpine

ARG MODULE
ARG PORT=8080

LABEL maintainer="songhg" \
      app="firefly-iot" \
      module="${MODULE}"

RUN apk add --no-cache tzdata curl && \
    cp /usr/share/zoneinfo/Asia/Shanghai /etc/localtime && \
    echo "Asia/Shanghai" > /etc/timezone

WORKDIR /app

COPY ${MODULE}/target/${MODULE}-*.jar app.jar

ENV JAVA_OPTS="-Xms256m -Xmx512m -Djava.security.egd=file:/dev/./urandom" \
    SPRING_PROFILES_ACTIVE=prod \
    TZ=Asia/Shanghai \
    SERVER_PORT=${PORT}

EXPOSE ${PORT}

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
    CMD curl -f http://localhost:${SERVER_PORT}/actuator/health || exit 1

ENTRYPOINT ["sh", "-c", "java ${JAVA_OPTS} -jar app.jar --spring.profiles.active=${SPRING_PROFILES_ACTIVE}"]
