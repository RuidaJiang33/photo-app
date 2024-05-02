/* eslint-disable import/extensions, import/no-absolute-path */
import { SQSHandler } from "aws-lambda";
import {
  GetObjectCommand,
  PutObjectCommandInput,
  GetObjectCommandInput,
  S3Client,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { DynamoDBClient, PutItemCommand, PutItemCommandInput } from "@aws-sdk/client-dynamodb";

const s3 = new S3Client();
const dynamoDBClient = new DynamoDBClient({ region: "eu-west-1" });
const dynamoDBTableName = "Photos";

export const handler: SQSHandler = async (event) => {
  console.log("Event ", JSON.stringify(event));
  for (const record of event.Records) {
    const recordBody = JSON.parse(record.body);  // Parse SQS message
    const snsMessage = JSON.parse(recordBody.Message); // Parse SNS message

    if (snsMessage.Records) {
      console.log("Record body ", JSON.stringify(snsMessage));
      for (const messageRecord of snsMessage.Records) {
        const s3e = messageRecord.s3;
        const srcBucket = s3e.bucket.name;
        // Object key may have spaces or unicode non-ASCII characters.
        const srcKey = decodeURIComponent(s3e.object.key.replace(/\+/g, " "));
        let origimage = null;
        try {
          // Download the image from the S3 source bucket.
          const params: GetObjectCommandInput = {
            Bucket: srcBucket,
            Key: srcKey,
          };
          origimage = await s3.send(new GetObjectCommand(params));

          if (!srcKey) {
            throw new Error("Source key is undefined");
          }

          // Check file extension
          const fileExtension = srcKey.split(".").pop().toLowerCase();
          if (fileExtension !== "jpeg" && fileExtension !== "png") {
            throw new Error(`Invalid file type: ${fileExtension}`);
          }

          // Write item to DynamoDB
          const dynamoDBParams: PutItemCommandInput = {
            TableName: dynamoDBTableName,
            Item: {
              "imageId": { S: srcKey },
              "fileExtension": { S: fileExtension }
            }
          };
          await dynamoDBClient.send(new PutItemCommand(dynamoDBParams));
          
          // Process the image ......
        } catch (error) {
          console.log(error);
          throw error;
        }
      }
    }
  }
};