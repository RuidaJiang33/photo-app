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
    let snsMessage;
    try {
      snsMessage = JSON.parse(record.body);
      console.log("Parsed message:", snsMessage);
    } catch (error) {
      console.error("ERROR parsing JSON:", error, "Data:", record.body);
      continue; // Skip this iteration if parsing fails
    }

    if (snsMessage.error && snsMessage.error.message) {
        const subject = "Image Upload Rejection";
        const message = `Your image upload has been rejected due to unsupported file type. Only JPEG and PNG are allowed.`;
        const params = sendEmailParams(subject, message);
        console.log("Sending rejection email with params:", params);
        await client.send(new SendEmailCommand(params));
    } else {
      console.log("No error message found in the record, or not a rejection case");
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
