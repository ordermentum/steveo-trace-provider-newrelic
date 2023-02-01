import newrelic from "newrelic";

interface TraceProvider {
  wrapHandler(
    txName: string,
    traceContext: unknown,
    callback: (traceContext: unknown) => any
  ): Promise<void>;
  wrapHandlerSegment(
    segmentName: string,
    traceContext: unknown,
    callback: any
  ): Promise<void>;
  onError(err: Error, traceContext: unknown): Promise<void>;
  serializeTraceMetadata(traceContext: unknown): Promise<string>;
  deserializeTraceMetadata(traceMetadata: unknown): Promise<unknown>;
}

export const traceProvider: TraceProvider = {
  /**
   * Used to create a New Relic transaction that encompasses the work done
   * within the provided callback.
   */
  wrapHandler: async (
    txName: string,
    traceContext: unknown,
    callback: (traceContext: unknown) => Promise<any>
  ): Promise<void> => {
    const context: any = traceContext || {};
    context.txName = txName;

    await newrelic.startBackgroundTransaction(txName, async () => {
      context.transaction = newrelic.getTransaction();
      if (context.distributedTraceHeaders) {
        context.transaction.acceptDistributedTraceHeaders(
          "Queue",
          context.distributedTraceHeaders
        );
        delete context.distributedTraceHeaders;
      }
      await callback(context);
    });
  },

  /**
   * @description Used inside the wrapHandler callback to wrap a specfic unit
   * of work.
   */
  wrapHandlerSegment: async (
    segmentName: string,
    traceContext: any,
    callback: (...args: any[]) => any
  ): Promise<void> => {
    await newrelic.startSegment(
      segmentName || `${traceContext?.txName}-segment`,
      true,
      callback
    );
  },

  onError: async (err: Error, _) => {
    newrelic.noticeError(err);
  },

  /**
   * @description Used to propagate traces. Accepts a traceContext instance
   * and returns a serialised trace metadata string that can be included in
   * a message payload. The trace metadata can then be deserialised by the
   * message consumer.
   */
  serializeTraceMetadata: async (traceContext: unknown): Promise<string> => {
    const context: any = traceContext;
    if (!context?.transaction) {
      throw new Error("Property `transaction` missing from context");
    }

    const traceHeaders = {};
    context.transaction.insertDistributedTraceHeaders(traceHeaders);
    return JSON.stringify(traceHeaders);
  },

  /**
   * @description Used to propagate traces. Accepts serialised trace
   * metadata and returns a traceContext instance that can be passed
   * to wrapHandler.
   */
  deserializeTraceMetadata: async (
    traceMetadata: unknown
  ): Promise<unknown> => {
    try {
      if (typeof traceMetadata !== "string") {
        return {};
      }
      return {
        distributedTraceHeaders: JSON.parse(traceMetadata),
      };
    } catch (error) {
      return {};
    }
  },
};
