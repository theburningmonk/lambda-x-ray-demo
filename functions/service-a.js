const AWSXRay = require('aws-xray-sdk')
const AWS = AWSXRay.captureAWS(require('aws-sdk'))
// const AWS = require('aws-sdk')
const sns = new AWS.SNS()
const sqs = new AWS.SQS()
const s3 = new AWS.S3()
const dynamodb = new AWS.DynamoDB.DocumentClient()
const lambda = new AWS.Lambda()
const kinesis = new AWS.Kinesis()
const eventbridge = new AWS.EventBridge()

const { 
  BUCKET_NAME, 
  TABLE_NAME, 
  TOPIC_ARN,
  QUEUE_URL,
  FUNCTION_NAME,
  STREAM_NAME,
  BUS_NAME,
} = process.env

async function publishSNS() {
  await sns.publish({
    TopicArn: TOPIC_ARN,
    Message: 'test'
  }).promise()
}

async function queueSQS() {
  await sqs.sendMessage({
    QueueUrl: QUEUE_URL,
    MessageBody: 'test'
  }).promise()
}

async function callLambda() {
  await lambda.invoke({
    FunctionName: FUNCTION_NAME,
    InvocationType: "RequestResponse",
    Payload: ""
  }).promise()
}

async function putS3(requestId) {
  await s3.putObject({
    Body: 'test',
    Bucket: BUCKET_NAME,
    Key: `${requestId}.txt`
  }).promise()
}

async function putDynamoDB(requestId) {
  await dynamodb.put({
    TableName: TABLE_NAME,
    Item: {
      id: requestId,
    }
  }).promise()
}

async function putKinesis(requestId) {
  await kinesis.putRecord({
    StreamName: STREAM_NAME,
    Data: 'test',
    PartitionKey: requestId
  }).promise()
}

async function putEventBridge() {
  await eventbridge.putEvents({
    Entries: [{
      EventBusName: BUS_NAME,
      Source: 'xray-test',
      Detail: JSON.stringify({ message: 'test' }),
      DetailType: 'message'
    }]
  }).promise()
}

module.exports.handler = async (event, context) => {
  await Promise.all([
    publishSNS(),
    queueSQS(),
    putS3(event.requestContext.requestId),
    putDynamoDB(event.requestContext.requestId),
    putKinesis(event.requestContext.requestId),
    callLambda(),
    putEventBridge(),
  ])

  return {
    statusCode: 200,
    body: JSON.stringify({
      message: 'done'
    }),
  }
}