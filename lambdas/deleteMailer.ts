import { DynamoDBStreamHandler } from "aws-lambda";
import {
  SESClient,
  SendEmailCommand,
  SendEmailCommandInput,
} from "@aws-sdk/client-ses";

import { SES_EMAIL_FROM, SES_EMAIL_TO, SES_REGION } from "../env";

const client = new SESClient({ region: SES_REGION });

export const handler: DynamoDBStreamHandler = async (event) => {
  console.log("Event: ", JSON.stringify(event));

  for (const record of event.Records) {

    if (record.eventName === 'REMOVE' && record.dynamodb && record.dynamodb.Keys) {

        const srcBucket = 'photoappstack-images9bf4dcd5-nuep7ycvhtn8';
        const srcKey = record.dynamodb.Keys.imageId.S
        try {
          const message = `Your image has been successfully deleted. Its URL is s3://${srcBucket}/${srcKey}`;
          const params = sendEmailParams("Image Delete Confirmation", message);
          await client.send(new SendEmailCommand(params));
          console.log("Email sent successfully!");
        } catch (error) {
          console.error("ERROR in sending email: ", error);
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
