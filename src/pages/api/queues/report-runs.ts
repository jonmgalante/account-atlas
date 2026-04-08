import { QueueClient } from "@vercel/queue";

import {
  reportRunQueueMessageHandler,
  retryReportRunQueueMessage,
  type ReportRunQueueMessage,
} from "@/server/pipeline/report-run-queue-consumer";

const queueClient = new QueueClient();

export default queueClient.handleNodeCallback<ReportRunQueueMessage>(reportRunQueueMessageHandler, {
  retry: retryReportRunQueueMessage,
});
