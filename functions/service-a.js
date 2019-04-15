const _        = require('lodash');
const utils    = require('./utils');
const AWSXRay  = require('aws-xray-sdk');
const AWS      = AWSXRay.captureAWS(require('aws-sdk'));
const sns      = new AWS.SNS();
const s3       = new AWS.S3();
const dynamodb = new AWS.DynamoDB.DocumentClient();
const lambda   = new AWS.Lambda();
const region   = AWS.config.region;

const BUCKET_NAME = process.env.BUCKET_NAME;

let publishSNS = segment => {
  return new Promise((resolve, reject) => {
    console.log('publishing to SNS topic');
    let f = async (subsegment) => {
      let topicArn = `arn:aws:sns:${region}:${global.accountId}:lambda-x-ray-demo-${process.env.stage}`;
      let message = 'test';

      subsegment.addAnnotation('topic', topicArn);
      subsegment.addMetadata('message', 'test');

      let req = {
        Message: message,
        TopicArn: topicArn
      };
      await sns.publish(req).promise();

      subsegment.close();
      resolve();
    };

    AWSXRay.captureAsyncFunc("## publishing to SNS", f, segment);
  });
};

let invokeLambda = segment => {
  return new Promise((resolve, reject) => {
    console.log('invoking Lambda function');

    let f = async (subsegment) => {
      let funcName = `${process.env.service}-${process.env.stage}-service-c`;
      subsegment.addAnnotation('function', funcName);

      let req = {
        FunctionName: funcName,
        InvocationType: "RequestResponse",
        Payload: ""
      };

      let resp = await lambda.invoke(req).promise();

      let respBody = resp.Payload.toString('utf8');
      subsegment.addMetadata('responseBody', respBody);

      subsegment.close();
      resolve();
    };

    AWSXRay.captureAsyncFunc("## invoking service-c", f, segment);
  });
};

let accessDynamoDB = segment => {
  return new Promise((resolve, reject) => {
    console.log('accessing DynamoDB');
    let f = async (subsegment) => {
      let table = `lambda-x-ray-demo-${process.env.stage}`;
      let id = global.requestId;
      let value = 'test';

      subsegment.addAnnotation('table', table);
      subsegment.addAnnotation('id', id);
      subsegment.addMetadata('value', value);

      let getReq = {
        TableName: table,
        Key: {
          id: value
        }
      };
      await dynamodb.get(getReq).promise();

      let putReq = {
        TableName: table,
        Item: {
          id: value,
        }
      };
      await dynamodb.put(putReq).promise();

      subsegment.close();
      resolve();
    };

    AWSXRay.captureAsyncFunc("## accessing DynamoDB", f, segment);
  });
};

let accessS3 = segment => {
  return new Promise((resolve, reject) => {
    console.log('accessing S3 buket');
    let f = async (subsegment) => {
      let bucket = BUCKET_NAME;
      let key = `${global.requestId}.txt`;
      let body = 'test';

      subsegment.addAnnotation('bucket', bucket);
      subsegment.addAnnotation('key', key);
      subsegment.addMetadata('body', body);

      let getReq = {
        Bucket: bucket,
        Key: key
      };
      await s3.getObject(getReq).promise().catch(_ => { }); // swallow errors

      let putReq = {
        Body: body,
        Bucket: bucket,
        Key: key
      };
      await s3.putObject(putReq).promise();

      subsegment.close();
      resolve();
    };

    AWSXRay.captureAsyncFunc("## accessing S3", f, segment);
  });
};

let callServiceB = (segment, n) => {
  return new Promise((resolve, reject) => {
    console.log("service-a is going to call service-b");

    let f = async (subsegment) => {
      subsegment.addAnnotation('path', '/dev/demo/service-b');  // this works
      subsegment.addMetadata('random', n);                      // this works
      console.log(JSON.stringify(subsegment));

      let resp = await utils.request('GET', global.hostname, '/dev/demo/service-b');

      console.log(resp);
      let body = JSON.parse(resp);

      subsegment.addMetadata('message', body.message);

      // remember to close subsegment or it won't show up in trace
      subsegment.close();
      resolve(body.message);
    };

    AWSXRay.captureAsyncFunc("## calling service b", f, segment);
  });
};

module.exports.handler = async (event, context) => {
  console.log(JSON.stringify(event));
  console.log(JSON.stringify(context));

  global.hostname = event.headers.Host;
  global.accountId = event.requestContext.accountId;
  global.requestId = event.requestContext.requestId;

  let segment = AWSXRay.getSegment();
  console.log(JSON.stringify(segment));

  let n = _.get(event, 'queryStringParameters.n', 0);

  // metadata and annotation are only allowed in subsegments, so these two lines
  // won't work as they're adding to the root segment
  segment.addMetadata('random', `${n}`);
  segment.addAnnotation('path', event.path);

  if (n <= 1) {
    await publishSNS(segment);
    await accessS3(segment);
    await accessDynamoDB(segment);
    await invokeLambda(segment);
    let message = await callServiceB(segment, n);
    const response = {
      statusCode: 200,
      body: JSON.stringify({
        message: `service-b says ${message}`
      }),
    };

    console.log(JSON.stringify(segment));

    return response;
  } else if (n <= 2) {
    console.log("service-a is going to call the timeout endpoint");
    await utils.request('GET', hostname, '/dev/demo/timeout');

    throw new Error("timed out");
  } else {
    console.log("service-a is going to call the error endpoint");
    await utils.request('GET', hostname, '/dev/demo/error');

    throw new Error("boom");
  }
};