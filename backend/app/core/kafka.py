import os
import json
from aiokafka import AIOKafkaProducer
import sentry_sdk
from app.core.event_logger import event_logger

KAFKA_BOOTSTRAP_SERVERS = os.getenv("KAFKA_BOOTSTRAP_SERVERS", "kafka:9092")

class KafkaService:
    def __init__(self):
        self.producer = None

    async def start(self):
        try:
            self.producer = AIOKafkaProducer(
                bootstrap_servers=KAFKA_BOOTSTRAP_SERVERS,
                value_serializer=lambda v: json.dumps(v).encode('utf-8')
            )
            await self.producer.start()
            event_logger.log(
                "KAFKA_PRODUCER_STARTED",
                "Backend connected to Kafka producer",
                direction="backend->kafka",
                peer=KAFKA_BOOTSTRAP_SERVERS,
            )
        except Exception as e:
            event_logger.log(
                "KAFKA_PRODUCER_START_FAILED",
                "Backend failed to connect to Kafka producer",
                direction="backend->kafka",
                peer=KAFKA_BOOTSTRAP_SERVERS,
                details={"error": str(e)},
            )
            sentry_sdk.capture_exception(e)

    async def stop(self):
        if self.producer:
            await self.producer.stop()
            event_logger.log(
                "KAFKA_PRODUCER_STOPPED",
                "Backend disconnected from Kafka producer",
                direction="backend->kafka",
                peer=KAFKA_BOOTSTRAP_SERVERS,
            )

    async def send_message(self, topic: str, message: dict):
        if not self.producer:
            event_logger.log(
                "KAFKA_MESSAGE_SKIPPED",
                "Kafka producer is not connected",
                direction="backend->kafka",
                peer=KAFKA_BOOTSTRAP_SERVERS,
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
            peer=KAFKA_BOOTSTRAP_SERVERS,
            entity_type="kafka_topic",
            entity_id=topic,
            details={"message": message},
        )

kafka_producer = KafkaService()
