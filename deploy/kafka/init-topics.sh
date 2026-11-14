#!/usr/bin/env bash
# ============================================================
# Firefly IoT Kafka topic bootstrap
#
# 预建平台全部业务 topic 以及每个 topic 对应的 <topic>.dlt 死信 topic。
# 脚本可重复执行：已存在的 topic 直接跳过（kafka-topics.sh --if-not-exists）。
#
# 用法（宿主机，需能访问 Kafka 且本机有 kafka-topics.sh）：
#   KAFKA_BOOTSTRAP_SERVERS=localhost:9092 \
#   KAFKA_TOPIC_PARTITIONS=3 KAFKA_TOPIC_REPLICATION_FACTOR=1 \
#   bash deploy/kafka/init-topics.sh
#
# 用法（compose，推荐，使用仓库内 apache/kafka 镜像里的脚本）：
#   docker compose -f deploy/docker-compose.prod.yml --env-file deploy/.env \
#     --profile kafka-init run --rm kafka-init
#
# 环境变量：
#   KAFKA_BOOTSTRAP_SERVERS        必填，broker 地址，多个用逗号分隔（默认 localhost:9092）
#   KAFKA_TOPIC_PARTITIONS         分区数（默认 3）
#   KAFKA_TOPIC_REPLICATION_FACTOR 副本数（默认 3；单 broker 环境必须设为 1）
#   KAFKA_TOPICS_BIN               kafka-topics.sh 路径（默认 /opt/kafka/bin/kafka-topics.sh）
#   KAFKA_BROKER_READY_RETRIES     等待 broker 可用的重试次数（默认 60，每次间隔 2 秒）
# ============================================================
set -euo pipefail

BOOTSTRAP_SERVERS="${KAFKA_BOOTSTRAP_SERVERS:-${KAFKA_SERVERS:-localhost:9092}}"
PARTITIONS="${KAFKA_TOPIC_PARTITIONS:-3}"
REPLICATION_FACTOR="${KAFKA_TOPIC_REPLICATION_FACTOR:-3}"
READY_RETRIES="${KAFKA_BROKER_READY_RETRIES:-60}"

# ------------------------------------------------------------------
# topic 清单，必须与以下常量类保持同步（勿只改 className 不改清单）：
#   firefly-common/src/main/java/com/songhg/firefly/iot/common/message/KafkaTopics.java
#   firefly-common/src/main/java/com/songhg/firefly/iot/common/event/EventTopics.java
# ------------------------------------------------------------------
TOPICS=(
  # ---- KafkaTopics ----
  "device.message.up"
  "device.message.down"
  "device.property.report"
  "device.event.report"
  "device.lifecycle"
  "device.service.invoke"
  "device.ota.progress"
  "rule.engine.input"
  "alarm.trigger"
  "share.data.forward"
  "platform.event"
  # ---- EventTopics ----
  "firefly.tenant.events"
  "firefly.user.events"
  "firefly.role.events"
  "firefly.permission.events"
  "firefly.auth.events"
  "firefly.session.events"
  "firefly.audit.events"
  "firefly.api.access.logs"
  "protocol.parser.changed"
  "video.device.status.changed"
  "video.channels.synced"
  "video.device.info.synced"
)

log() {
  printf '[kafka-init] %s\n' "$*"
}

die() {
  printf '[kafka-init] ERROR: %s\n' "$*" >&2
  exit 1
}

# 定位 kafka-topics.sh：容器内默认路径优先，宿主机则回退到 PATH
resolve_kafka_topics_bin() {
  if [ -n "${KAFKA_TOPICS_BIN:-}" ] && [ -x "${KAFKA_TOPICS_BIN}" ]; then
    printf '%s' "${KAFKA_TOPICS_BIN}"
    return 0
  fi
  for candidate in /opt/kafka/bin/kafka-topics.sh "$(command -v kafka-topics.sh 2>/dev/null || true)"; do
    if [ -n "${candidate}" ] && [ -x "${candidate}" ]; then
      printf '%s' "${candidate}"
      return 0
    fi
  done
  die "未找到 kafka-topics.sh，请通过 KAFKA_TOPICS_BIN 指定完整路径"
}

KAFKA_TOPICS="$(resolve_kafka_topics_bin)"

# 定位 kafka-broker-api-versions.sh（可选，用于副本数预检）
KAFKA_BROKER_API_VERSIONS=""
for candidate in \
  "$(dirname "${KAFKA_TOPICS}")/kafka-broker-api-versions.sh" \
  "$(command -v kafka-broker-api-versions.sh 2>/dev/null || true)"; do
  if [ -n "${candidate}" ] && [ -x "${candidate}" ]; then
    KAFKA_BROKER_API_VERSIONS="${candidate}"
    break
  fi
done

[ -n "${BOOTSTRAP_SERVERS}" ] || die "KAFKA_BOOTSTRAP_SERVERS 不能为空"
case "${PARTITIONS}" in
  ''|*[!0-9]*) die "KAFKA_TOPIC_PARTITIONS 必须为正整数，当前值: ${PARTITIONS}" ;;
esac
case "${REPLICATION_FACTOR}" in
  ''|*[!0-9]*) die "KAFKA_TOPIC_REPLICATION_FACTOR 必须为正整数，当前值: ${REPLICATION_FACTOR}" ;;
esac
[ "${PARTITIONS}" -ge 1 ] || die "KAFKA_TOPIC_PARTITIONS 必须 >= 1"
[ "${REPLICATION_FACTOR}" -ge 1 ] || die "KAFKA_TOPIC_REPLICATION_FACTOR 必须 >= 1"

log "bootstrap-servers=${BOOTSTRAP_SERVERS}"
log "partitions=${PARTITIONS} replication-factor=${REPLICATION_FACTOR}"

# 等待 broker 可用：compose 下 broker 可能仍在选主，直接 --create 会失败
wait_for_broker() {
  local attempt=1
  while [ "${attempt}" -le "${READY_RETRIES}" ]; do
    if "${KAFKA_TOPICS}" --bootstrap-server "${BOOTSTRAP_SERVERS}" --list >/dev/null 2>&1; then
      log "broker 已就绪（第 ${attempt} 次探测）"
      return 0
    fi
    log "broker 暂不可用，${attempt}/${READY_RETRIES} 次探测失败，2 秒后重试"
    sleep 2
    attempt=$((attempt + 1))
  done
  die "等待 broker 超时（${READY_RETRIES} 次探测均失败），请检查 ${BOOTSTRAP_SERVERS}"
}

# 副本数超过 broker 数量时给出明确错误，避免 40 多个 topic 逐个失败
check_replication_factor() {
  [ -n "${KAFKA_BROKER_API_VERSIONS}" ] || return 0
  local broker_count
  broker_count="$("${KAFKA_BROKER_API_VERSIONS}" --bootstrap-server "${BOOTSTRAP_SERVERS}" 2>/dev/null \
    | grep -oE 'id: -?[0-9]+' | wc -l | tr -d ' ')"
  if [ -z "${broker_count}" ] || [ "${broker_count}" -eq 0 ]; then
    log "WARN: 无法探测 broker 数量，跳过副本数预检"
    return 0
  fi
  log "探测到 ${broker_count} 个 broker"
  if [ "${REPLICATION_FACTOR}" -gt "${broker_count}" ]; then
    die "KAFKA_TOPIC_REPLICATION_FACTOR=${REPLICATION_FACTOR} 大于 broker 数量 ${broker_count}；单 broker 环境请设为 1，3 broker HA 集群设为 3"
  fi
}

create_topic() {
  local topic="$1"
  "${KAFKA_TOPICS}" --create --if-not-exists \
    --bootstrap-server "${BOOTSTRAP_SERVERS}" \
    --topic "${topic}" \
    --partitions "${PARTITIONS}" \
    --replication-factor "${REPLICATION_FACTOR}" >/dev/null
  log "created/exists: ${topic}"
}

wait_for_broker
check_replication_factor

created=0
for topic in "${TOPICS[@]}"; do
  create_topic "${topic}"
  # 消费失败重试耗尽后由 DeadLetterPublishingRecoverer 投递到 <topic>.dlt；
  # 预建可避免首次进入死信时因 auto-create 关闭而丢失消息
  create_topic "${topic}.dlt"
  created=$((created + 2))
done

log "完成：共处理 ${#TOPICS[@]} 个业务 topic 与 ${#TOPICS[@]} 个 .dlt topic（${created} 个）"
