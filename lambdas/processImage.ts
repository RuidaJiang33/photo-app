/* eslint-disable import/extensions, import/no-absolute-path */
import { SQSHandler } from "aws-lambda";
import {
  GetObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { DynamoDBClient, PutItemCommand } from "@aws-sdk/client-dynamodb";
import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs";

const s3 = new S3Client();
const sqsClient = new SQSClient({ region: process.env.REGION });
const dynamoDBClient = new DynamoDBClient({ region: process.env.REGION });
const dynamoDBTableName = process.env.TABLE_NAME;
const dlqUrl = process.env.DLQ_URL;

export const handler: SQSHandler = async (event) => {
  console.log("Event ", JSON.stringify(event));
  for (const record of event.Records) {
    const recordBody = JSON.parse(record.body);  // Parse SQS message
    const snsMessage = JSON.parse(recordBody.Message); // Parse SNS message

    if (snsMessage.Records) {
      console.log("Processing S3 event records: ", JSON.stringify(snsMessage.Records));
      for (const messageRecord of snsMessage.Records) {
        const s3Event = messageRecord.s3;
        const srcBucket = s3Event.bucket.name;
        const srcKey = decodeURIComponent(s3Event.object.key.replace(/\+/g, " "));

        try {
          // Check file extension
          const fileExtension = getFileExtension(srcKey);
          if (!isValidImageExtension(fileExtension)) {
            throw new Error(`Invalid file type: ${fileExtension}`);
          }

          // Write item to DynamoDB
          await writeToDynamoDB(srcKey, fileExtension);

          // Optionally, process the image further if needed
          console.log(`Processed image with key: ${srcKey}`);
        } catch (error) {
          await notifyError(srcKey, error);
          throw error;
        }
      }
    }
  }

};

function getFileExtension(filename) {
  return filename.split(".").pop().toLowerCase();
}

function isValidImageExtension(extension) {
  return ['jpeg', 'png'].includes(extension);
}

async function writeToDynamoDB(key, extension) {
  const params = {
    TableName: dynamoDBTableName,
    Item: {
      "imageId": { S: key },
      "fileExtension": { S: extension }
    }
  };
  await dynamoDBClient.send(new PutItemCommand(params));
}

async function notifyError(key, error) {
  const errorMessage = JSON.stringify({
    key,
    error: {
      message: error.message
    },
    timestamp: new Date().toISOString()
  });
  await sqsClient.send(new SendMessageCommand({
    QueueUrl: dlqUrl,
    MessageBody: errorMessage
  }));
}