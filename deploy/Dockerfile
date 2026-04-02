# syntax=docker/dockerfile:1.7

# ============================================================
# 通用 Dockerfile — 适用于所有 firefly-* Java 微服务
# 直接在镜像构建阶段完成 Maven 打包，宿主机无需预先安装 Maven
# ============================================================

FROM maven:3.9.9-eclipse-temurin-21-alpine AS builder

ARG MODULE
ARG MAVEN_MIRROR_URL=https://repo.huaweicloud.com/repository/maven/

WORKDIR /workspace

# 远端已确认 Maven Central 在当前宿主机极慢，这里直接收口到稳定镜像源。
RUN mkdir -p /root/.m2 && cat > /root/.m2/settings.xml <<EOF
<settings xmlns="http://maven.apache.org/SETTINGS/1.2.0"
          xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
          xsi:schemaLocation="http://maven.apache.org/SETTINGS/1.2.0 https://maven.apache.org/xsd/settings-1.2.0.xsd">
  <mirrors>
    <mirror>
      <id>firefly-fast-mirror</id>
      <name>Firefly fast mirror</name>
      <url>${MAVEN_MIRROR_URL}</url>
      <mirrorOf>*</mirrorOf>
    </mirror>
  </mirrors>
</settings>
EOF

COPY pom.xml pom.xml
COPY firefly-common/pom.xml firefly-common/pom.xml
COPY firefly-api/pom.xml firefly-api/pom.xml
COPY firefly-plugin-api/pom.xml firefly-plugin-api/pom.xml
COPY firefly-system/pom.xml firefly-system/pom.xml
COPY firefly-device/pom.xml firefly-device/pom.xml
COPY firefly-rule/pom.xml firefly-rule/pom.xml
COPY firefly-data/pom.xml firefly-data/pom.xml
COPY firefly-support/pom.xml firefly-support/pom.xml
COPY firefly-media/pom.xml firefly-media/pom.xml
COPY firefly-connector/pom.xml firefly-connector/pom.xml
COPY firefly-gateway/pom.xml firefly-gateway/pom.xml

COPY firefly-common/src firefly-common/src
COPY firefly-api/src firefly-api/src
COPY firefly-plugin-api/src firefly-plugin-api/src
COPY firefly-system/src firefly-system/src
COPY firefly-device/src firefly-device/src
COPY firefly-rule/src firefly-rule/src
COPY firefly-data/src firefly-data/src
COPY firefly-support/src firefly-support/src
COPY firefly-media/src firefly-media/src
COPY firefly-connector/src firefly-connector/src
COPY firefly-gateway/src firefly-gateway/src

# 各服务镜像共用同一份 Maven 缓存，顺序构建时后续服务可直接复用首个服务下载的依赖。
RUN --mount=type=cache,id=firefly-maven-repo,target=/root/.m2,sharing=locked \
    mvn -pl "${MODULE}" -am package -DskipTests

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

COPY --from=builder /workspace/${MODULE}/target/${MODULE}-*.jar app.jar

ENV JAVA_OPTS="-Xms256m -Xmx512m -Djava.security.egd=file:/dev/./urandom" \
    SPRING_PROFILES_ACTIVE=prod \
    TZ=Asia/Shanghai \
    SERVER_PORT=${PORT}

EXPOSE ${PORT}

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
    CMD curl -f http://localhost:${SERVER_PORT}/actuator/health || exit 1

ENTRYPOINT ["sh", "-c", "java ${JAVA_OPTS} -jar app.jar --spring.profiles.active=${SPRING_PROFILES_ACTIVE}"]
