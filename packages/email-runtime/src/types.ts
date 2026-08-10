export type EmailRuntimeDocumentClient = {
  get(input: Record<string, unknown>): Promise<any>;
  put(input: Record<string, unknown>): Promise<any>;
  query(input: Record<string, unknown>): Promise<any>;
  update(input: Record<string, unknown>): Promise<any>;
  delete(input: Record<string, unknown>): Promise<any>;
  transactWrite(input: Record<string, unknown>): Promise<any>;
};

export type EmailTransport = {
  sendMail(input: Record<string, unknown>): Promise<{ messageId?: unknown } | null | undefined>;
};

export type EmailTransportFactory = (config: unknown) => EmailTransport;
