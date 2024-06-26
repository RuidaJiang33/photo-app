import * as cdk from "aws-cdk-lib";
import * as lambdanode from "aws-cdk-lib/aws-lambda-nodejs";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as s3n from "aws-cdk-lib/aws-s3-notifications";
import * as events from "aws-cdk-lib/aws-lambda-event-sources";
import * as sqs from "aws-cdk-lib/aws-sqs";
import * as sns from "aws-cdk-lib/aws-sns";
import * as subs from "aws-cdk-lib/aws-sns-subscriptions";
import * as iam from "aws-cdk-lib/aws-iam";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import { SES_EMAIL_FROM, SES_EMAIL_TO, SES_REGION } from "../env";
import { DynamoEventSource } from "aws-cdk-lib/aws-lambda-event-sources";
import { StartingPosition } from "aws-cdk-lib/aws-lambda";

import { Construct } from "constructs";
// import * as sqs from 'aws-cdk-lib/aws-sqs';

export class PhotoAppStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // DynamoDB Table
    const imageItemsTable = new dynamodb.Table(this, "ImageItemsTable", {
      partitionKey: { name: "imageId", type: dynamodb.AttributeType.STRING },
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      stream: dynamodb.StreamViewType.NEW_AND_OLD_IMAGES
    });

    // Bucket
    const imagesBucket = new s3.Bucket(this, "images", {
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      publicReadAccess: false,
    });

    // Queue
    const imageProcessQueue = new sqs.Queue(this, "img-created-queue", {
      receiveMessageWaitTime: cdk.Duration.seconds(10),
    });

    const mailerDLQ = new sqs.Queue(this, "mailer-dlq", {
      retentionPeriod: cdk.Duration.minutes(30),
    });

    // Topic
    const handleImageTopic = new sns.Topic(this, "HandleImageTopic", {
      displayName: "Handle Image topic",
    });

    // Lambda functions
    const processImageFn = new lambdanode.NodejsFunction(
      this,
      "ProcessImageFn",
      {
        runtime: lambda.Runtime.NODEJS_18_X,
        entry: `${__dirname}/../lambdas/processImage.ts`,
        timeout: cdk.Duration.seconds(15),
        memorySize: 128,
        environment: {
          TABLE_NAME: imageItemsTable.tableName,
          REGION: 'eu-west-1',
          DLQ_URL: mailerDLQ.queueUrl,
        }
      }
    );

    const processDeleteFn = new lambdanode.NodejsFunction(
      this,
      "ProcessDeleteFn",
      {
        runtime: lambda.Runtime.NODEJS_18_X,
        entry: `${__dirname}/../lambdas/processDelete.ts`,
        timeout: cdk.Duration.seconds(15),
        memorySize: 128,
        environment: {
          TABLE_NAME: imageItemsTable.tableName,
          REGION: 'eu-west-1',
        }
      }
    );

    const updateTableFn = new lambdanode.NodejsFunction(
      this,
      "UpdateTableFn",
      {
        runtime: lambda.Runtime.NODEJS_18_X,
        entry: `${__dirname}/../lambdas/updateTable.ts`,
        timeout: cdk.Duration.seconds(15),
        memorySize: 128,
        environment: {
          TABLE_NAME: imageItemsTable.tableName,
          REGION: 'eu-west-1',
        }
      }
    );

    const confirmationMailerFn = new lambdanode.NodejsFunction(this, "ConfirmationMailerFn", {
      runtime: lambda.Runtime.NODEJS_18_X, 
      entry: `${__dirname}/../lambdas/confirmationMailer.ts`,
      environment: {
        SES_EMAIL_FROM: SES_EMAIL_FROM,
        SES_EMAIL_TO: SES_EMAIL_TO,
        SES_REGION: SES_REGION
      },
      timeout: cdk.Duration.seconds(10),
      memorySize: 256,
    });

    const rejectionMailerFn = new lambdanode.NodejsFunction(this, "RejectionMailerFn", {
      runtime: lambda.Runtime.NODEJS_18_X,
      entry: `${__dirname}/../lambdas/rejectionMailer.ts`,
      environment: {
        SES_EMAIL_FROM: SES_EMAIL_FROM,
        SES_EMAIL_TO: SES_EMAIL_TO,
        SES_REGION: SES_REGION
      },
      timeout: cdk.Duration.seconds(10),
      memorySize: 256,
    });

    const deleteMailerFn = new lambdanode.NodejsFunction(this, "DeleteMailerFn", {
      runtime: lambda.Runtime.NODEJS_18_X,
      entry: `${__dirname}/../lambdas/deleteMailer.ts`,
      environment: {
        SES_EMAIL_FROM: SES_EMAIL_FROM,
        SES_EMAIL_TO: SES_EMAIL_TO,
        SES_REGION: SES_REGION
      },
      timeout: cdk.Duration.seconds(10),
      memorySize: 256,
    });


    // S3 --> SQS
    imagesBucket.addEventNotification(
      s3.EventType.OBJECT_CREATED,
      new s3n.SnsDestination(handleImageTopic)
    );

    imagesBucket.addEventNotification(
      s3.EventType.OBJECT_REMOVED_DELETE,
      new s3n.SnsDestination(handleImageTopic)
    );
    

    // Subscribes
    handleImageTopic.addSubscription(new subs.SqsSubscription(imageProcessQueue));

    handleImageTopic.addSubscription(new subs.LambdaSubscription(confirmationMailerFn));

    handleImageTopic.addSubscription(new subs.LambdaSubscription(processDeleteFn));

    handleImageTopic.addSubscription(
      new subs.LambdaSubscription(updateTableFn, {
        filterPolicy: {
          comment_type: sns.SubscriptionFilter.stringFilter({
            allowlist: ["Caption"]
          })
        },
      })
    );
    

    // SQS --> Lambda
    processImageFn.addEventSource(new events.SqsEventSource(imageProcessQueue));
    confirmationMailerFn.addEventSource(new events.SqsEventSource(imageProcessQueue, {
      batchSize: 5,
    }));
    rejectionMailerFn.addEventSource(new events.SqsEventSource(mailerDLQ, {
      batchSize: 5,
    }));


    // DynamoDB --> Lambda
    deleteMailerFn.addEventSource(
      new DynamoEventSource(imageItemsTable, {
        startingPosition: StartingPosition.TRIM_HORIZON,
        batchSize: 5,
        bisectBatchOnError: true,
        retryAttempts: 2,
        enabled: true,
      })
    );


    // Set up IAM permissions
    const sesPolicy = new iam.PolicyStatement({
      actions: ["ses:SendEmail", "ses:SendRawEmail"],
      resources: ["*"],
    });
    confirmationMailerFn.addToRolePolicy(sesPolicy);
    rejectionMailerFn.addToRolePolicy(sesPolicy);
    deleteMailerFn.addToRolePolicy(sesPolicy);

    
    const sqsSendMessagePolicy = new iam.PolicyStatement({
      actions: ['sqs:SendMessage'],
      resources: [mailerDLQ.queueArn],
      effect: iam.Effect.ALLOW
    });
    processImageFn.addToRolePolicy(sqsSendMessagePolicy);


    const snsPolicy = new iam.PolicyStatement({
      actions: ['sns:ReceiveMessage', 'sns:GetTopicAttributes'],
      resources: [handleImageTopic.topicArn],
    });
    updateTableFn.addToRolePolicy(snsPolicy);
    updateTableFn.addEnvironment("TOPIC_ARN", handleImageTopic.topicArn);

  

    // Permissions
    imagesBucket.grantRead(processImageFn);
    imagesBucket.grantRead(processDeleteFn);
    imageItemsTable.grantWriteData(processImageFn);
    imageItemsTable.grantReadWriteData(processDeleteFn);
    imageItemsTable.grantReadWriteData(updateTableFn);


    // Output
    new cdk.CfnOutput(this, "bucketName", {
      value: imagesBucket.bucketName,
    });
    new cdk.CfnOutput(this, "imageItemsTableName", {
      value: imageItemsTable.tableName,
    });
    new cdk.CfnOutput(this, "handleImageTopicArn", {
      value: handleImageTopic.topicArn,
    });
  }
}
