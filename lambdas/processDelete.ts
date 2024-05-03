import { SNSHandler } from "aws-lambda";
import { DynamoDBClient, DeleteItemCommand } from "@aws-sdk/client-dynamodb";

const dynamoDBClient = new DynamoDBClient({ region: process.env.REGION });
const dynamoDBTableName = process.env.TABLE_NAME;

export const handler: SNSHandler = async (event) => {
  console.log("Received SNS event: ", JSON.stringify(event));

  for (const record of event.Records) {
  const snsMessage = JSON.parse(record.Sns.Message);
    if (snsMessage.Records) {
      for (const messageRecord of snsMessage.Records) {
        const s3Event = messageRecord.s3;
        const srcKey = decodeURIComponent(s3Event.object.key.replace(/\+/g, " "));

        try {
            // Delete the item in DynamoDB
            await deleteItemFromDynamoDB(srcKey)
            console.log(`Delete image with key: ${srcKey}`);
        } catch (error) {
            console.error("Error deleting DynamoDB: ", error);
            throw error;
        }
      }
    }
  }
};

async function deleteItemFromDynamoDB(key) {
  const params = {
    TableName: dynamoDBTableName,
    Key: {
      "imageId": { S: key }
    }
  };
  await dynamoDBClient.send(new DeleteItemCommand(params));
}
