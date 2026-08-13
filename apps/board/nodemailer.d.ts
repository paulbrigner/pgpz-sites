declare module "nodemailer" {
  type TransportOptions = string | Record<string, unknown>;

  type MailOptions = {
    to: string;
    from: string;
    subject: string;
    text: string;
    html: string;
  };

  type SendResult = {
    messageId?: string;
  };

  type Transporter = {
    sendMail(options: MailOptions): Promise<SendResult>;
  };

  const nodemailer: {
    createTransport(options: TransportOptions): Transporter;
  };

  export default nodemailer;
}
