import { SQSHandler } from "aws-lambda";
import {
  SESClient,
  SendEmailCommand,
  SendEmailCommandInput,
} from "@aws-sdk/client-ses";
import { SES_EMAIL_FROM, SES_EMAIL_TO, SES_REGION } from "../env";

const client = new SESClient({ region: SES_REGION });

export const handler: SQSHandler = async (event) => {
  console.log("Event: ", JSON.stringify(event));
  for (const record of event.Records) {
    const recordBody = JSON.parse(record.body);
    const snsMessage = JSON.parse(recordBody.Message);

    if (snsMessage.Records) {
      for (const messageRecord of snsMessage.Records) {
        const s3e = messageRecord.s3;
        const srcBucket = s3e.bucket.name;
        const srcKey = decodeURIComponent(s3e.object.key.replace(/\+/g, " "));

        try {
          const message = `Your image has been successfully uploaded. Its URL is s3://${srcBucket}/${srcKey}`;
          const params = sendEmailParams("Image Upload Confirmation", message);
          await client.send(new SendEmailCommand(params));
        } catch (error) {
          console.error("ERROR: ", error);
        }
      }
    }
  }
};

function sendEmailParams(subject: string, message: string) {
  const parameters: SendEmailCommandInput = {
    Destination: {
      ToAddresses: [SES_EMAIL_TO],
    },
    Message: {
      Body: {
        Html: {
          Charset: "UTF-8",
          Data: `
            <html>
              <body>
                <p>${message}</p>
              </body>
            </html>
          `,
        },
      },
      Subject: {
        Charset: "UTF-8",
        Data: subject,
      },
    },
    Source: SES_EMAIL_FROM,
  };
  return parameters;
}
