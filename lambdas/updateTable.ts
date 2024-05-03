import { SNSHandler } from "aws-lambda";
import { DynamoDBClient, UpdateItemCommand } from "@aws-sdk/client-dynamodb";

const dynamoDBClient = new DynamoDBClient({ region: process.env.REGION });
const dynamoDBTableName = process.env.TABLE_NAME;

export const handler: SNSHandler = async (event) => {
    console.log("Event: ", JSON.stringify(event));
    for (const record of event.Records) {
        const snsMessage = JSON.parse(record.Sns.Message);
        const name = snsMessage.name;
        const description = snsMessage.description;
        const commentType = record.Sns.MessageAttributes?.comment_type?.Value;

        if (commentType === 'Caption') {
            try {
                // Update the item in DynamoDB
                await updateDynamoDB(name, description);
                console.log(`Updated image with key: ${name} with new description: ${description}`);
            } catch (error) {
                console.error("Error updating DynamoDB: ", error);
                throw error;
            }
        } else {
            console.log("Unsupported comment_type or missing comment_type.");
        }
    }
}

async function updateDynamoDB(key, description) {
    const params = {
        TableName: dynamoDBTableName,
        Key: {
            "imageId": { S: key }
        },
        UpdateExpression: "set description = :desc",
        ExpressionAttributeValues: {
            ":desc": { S: description }
        },
        ReturnValues: "UPDATED_NEW"
    };
    await dynamoDBClient.send(new UpdateItemCommand(params));
}
