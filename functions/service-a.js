'use strict';

const co       = require('co');
const Promise  = require('bluebird');
const utils    = require('./utils');
const AWSXRay  = require('aws-xray-sdk');
const AWS      = AWSXRay.captureAWS(require('aws-sdk'));
const sns      = Promise.promisifyAll(new AWS.SNS());
const s3       = Promise.promisifyAll(new AWS.S3());
const dynamodb = Promise.promisifyAll(new AWS.DynamoDB.DocumentClient());
const region   = AWS.config.region;
const lambda   = new AWS.Lambda();

let publishSNS = co.wrap(function* (segment) {
  console.log('publishing to SNS topic');
  AWSXRay.captureFunc("## publishing to SNS", (subsegment) => {
    let topicArn = `arn:aws:sns:${region}:${global.accountId}:lambda-x-ray-demo-${process.env.stage}`;
    let message = 'test';

    subsegment.addAnnotation('topic', topicArn);
    subsegment.addMetadata('message', 'test');

    let req = {
      Message: message,
      TopicArn: topicArn
    };
    yield sns.publishAsync(req);
  }, segment);
});

let invokeLambda = co.wrap(function* (segment) {
  console.log('invoking Lambda function');
  AWSXRay.captureFunc("## invoking service-c", co.wrap(function* (subsegment) {
    let funcName = `${process.env.service}-${process.env.stage}-service-c`;
    subsegment.addAnnotation('function', funcName);

    let req = {
      FunctionName: funcName,
      InvocationType: "RequestResponse", 
      Payload: ""
    };
    let resp = yield lambda.invoke(req).promise();

    let respBody = resp.Payload.toString('utf8');
    subsegment.addMetadata('responseBody', respBody);
  }), segment);
});

let accessDynamoDB = co.wrap(function* (segment) {
  console.log('accessing DynamoDB');
  AWSXRay.captureFunc("## accessing DynamoDB", (subsegment) => {
    let table = `lambda-x-ray-demo-${process.env.stage}`;
    let id = global.requestId;
    let value = 'test';

    subsegment.addAnnotation('table', table);
    subsegment.addAnnotation('id', id);
    subsegment.addMetadata('value', value);

    let getReq = {
      TableName : table,
      Key: {
        id: value
      }
    };
    yield dynamodb.getAsync(getReq);

    let putReq = {
      TableName : table,
      Item: {
        id: value,      
      }
    };
    yield dynamodb.putAsync(putReq);
  });
});

let accessS3 = co.wrap(function* (segment) {
  console.log('accessing S3 buket');
  AWSXRay.captureFunc("## accessing S3", (subsegment) => {
    let bucket = `lambda-x-ray-demo-${process.env.stage}`;
    let key = `${global.requestId}.txt`;
    let body = 'test';

    subsegment.addAnnotation('bucket', bucket);
    subsegment.addAnnotation('key', key);
    subsegment.addMetadata('body', body);

    let getReq = {
      Bucket: bucket, 
      Key: key
    };
    yield s3.getObjectAsync(getReq).catch(_ => {}); // swallow errors

    let putReq = {
      Body: body,
      Bucket: bucket, 
      Key: key
    };
    yield s3.putObjectAsync(putReq);
  });
});

let callServiceB = co.wrap(function* (segment, n, callback) {
  console.log("service-a is going to call service-b");

  let subsegment = segment.addNewSubsegment("## calling service b");
  subsegment.addAnnotation('path', '/dev/demo/service-b');  // this works
  subsegment.addMetadata('random', n);                      // this works
  console.log(JSON.stringify(subsegment));

  let resp = yield utils.request('GET', global.hostname, '/dev/demo/service-b');

  // remember to close subsegment or it won't show up in trace
  subsegment.close();

  console.log(resp);
  let body = JSON.parse(resp);

  subsegment.addMetadata('message', body.message);

  const response = {
    statusCode: 200,
    body: JSON.stringify({
      message: `service-b says ${body.message}`
    }),
  };

  callback(null, response);
});

module.exports.handler = co.wrap(function* (event, context, callback) {
  console.log(JSON.stringify(event));
  console.log(JSON.stringify(context));

  global.hostname = event.headers.Host;
  global.accountId = event.requestContext.accountId;
  global.requestId = event.requestContext.requestId;

  let segment = AWSXRay.getSegment();
  console.log(JSON.stringify(segment));

  let n = Math.random() * 3;
  segment.addMetadata('random', `${n}`);      // this doesn't work
  segment.addAnnotation('path', event.path);  // this doesn't work

  if (n <= 3) {
    yield publishSNS(segment);
    yield accessS3(segment);
    yield accessDynamoDB(segment);
    yield invokeLambda(segment);
    yield callServiceB(segment, n, callback);    
  } else if (n <= 2) {
    console.log("service-a is going to call the timeout endpoint");
    yield utils.request('GET', hostname, '/dev/demo/timeout');

    throw new Error("timed out");
  } else {
    console.log("service-a is going to call the error endpoint");
    yield utils.request('GET', hostname, '/dev/demo/error');

    throw new Error("boom");
  }
});