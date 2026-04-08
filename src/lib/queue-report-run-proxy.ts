import type { MessageMetadata } from "@vercel/queue";
import { z } from "zod";

export const reportRunQueueMessageSchema = z.object({
  runId: z.number().int().positive(),
});

export type ReportRunQueueMessage = z.infer<typeof reportRunQueueMessageSchema>;

export const serializableQueueMessageMetadataSchema = z.object({
  messageId: z.string().min(1),
  deliveryCount: z.number().int().nonnegative(),
  createdAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
  topicName: z.string().min(1),
  consumerGroup: z.string().min(1),
  region: z.string().min(1),
});

export type SerializableQueueMessageMetadata = z.infer<typeof serializableQueueMessageMetadataSchema>;

export const reportRunQueueProxyRequestSchema = z.object({
  message: reportRunQueueMessageSchema,
  metadata: serializableQueueMessageMetadataSchema,
});

export type ReportRunQueueProxyRequest = z.infer<typeof reportRunQueueProxyRequestSchema>;

export const reportRunQueueProxyResponseSchema = z.union([
  z.object({
    acknowledge: z.literal(true),
  }),
  z.object({
    retryAfterSeconds: z.number().int().positive(),
  }),
]);

export type ReportRunQueueProxyResponse = z.infer<typeof reportRunQueueProxyResponseSchema>;

export function serializeQueueMessageMetadata(metadata: MessageMetadata): SerializableQueueMessageMetadata {
  return {
    messageId: metadata.messageId,
    deliveryCount: metadata.deliveryCount,
    createdAt: metadata.createdAt.toISOString(),
    expiresAt: metadata.expiresAt.toISOString(),
    topicName: metadata.topicName,
    consumerGroup: metadata.consumerGroup,
    region: metadata.region,
  };
}

export function hydrateQueueMessageMetadata(metadata: SerializableQueueMessageMetadata): MessageMetadata {
  return {
    ...metadata,
    createdAt: new Date(metadata.createdAt),
    expiresAt: new Date(metadata.expiresAt),
  };
}
