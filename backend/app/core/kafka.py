import json
from typing import Optional

import sentry_sdk
from aiokafka import AIOKafkaProducer

from app.core.config import get_settings
from app.core.event_logger import event_logger


class KafkaService:
    def __init__(self) -> None:
        self.producer: Optional[AIOKafkaProducer] = None
        self._bootstrap = get_settings().kafka_bootstrap_servers

    @property
    def enabled(self) -> bool:
        return bool(self._bootstrap)

    async def start(self) -> None:
        if not self.enabled:
            event_logger.log(
                "KAFKA_PRODUCER_DISABLED",
                "Kafka bootstrap servers are not configured",
                direction="backend->kafka",
            )
            return
        try:
            self.producer = AIOKafkaProducer(
                bootstrap_servers=self._bootstrap,
                value_serializer=lambda v: json.dumps(v).encode("utf-8"),
            )
            await self.producer.start()
            event_logger.log(
                "KAFKA_PRODUCER_STARTED",
                "Backend connected to Kafka producer",
                direction="backend->kafka",
                peer=self._bootstrap,
            )
        except Exception as exc:
            self.producer = None
            event_logger.log(
                "KAFKA_PRODUCER_START_FAILED",
                "Backend failed to connect to Kafka producer",
                direction="backend->kafka",
                peer=self._bootstrap,
                details={"error_type": type(exc).__name__, "error": str(exc)},
            )
            sentry_sdk.capture_exception(exc)

    async def stop(self) -> None:
        if not self.producer:
            return
        await self.producer.stop()
        event_logger.log(
            "KAFKA_PRODUCER_STOPPED",
            "Backend disconnected from Kafka producer",
            direction="backend->kafka",
            peer=self._bootstrap,
        )
        self.producer = None

    async def send_message(self, topic: str, message: dict) -> None:
        if not self.producer:
            event_logger.log(
                "KAFKA_MESSAGE_SKIPPED",
                "Kafka producer is not connected",
                direction="backend->kafka",
                peer=self._bootstrap,
                entity_type="kafka_topic",
                entity_id=topic,
                details={"message": message},
            )
            return
        await self.producer.send_and_wait(topic, message)
        event_logger.log(
            "KAFKA_MESSAGE_SENT",
            "Backend sent event to Kafka",
            direction="backend->kafka",
            peer=self._bootstrap,
            entity_type="kafka_topic",
            entity_id=topic,
            details={"message": message},
        )


kafka_producer = KafkaService()
