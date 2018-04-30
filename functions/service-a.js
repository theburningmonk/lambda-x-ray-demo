'use strict';

const _        = require('lodash');
const co       = require('co');
const Promise  = require('bluebird');
const utils    = require('./utils');
const AWSXRay  = require('aws-xray-sdk');
const AWS      = AWSXRay.captureAWS(require('aws-sdk'));
const sns      = Promise.promisifyAll(new AWS.SNS());
const s3       = Promise.promisifyAll(new AWS.S3());
const dynamodb = Promise.promisifyAll(new AWS.DynamoDB.DocumentClient());
const lambda   = new AWS.Lambda();
const region   = AWS.config.region;

const BUCKET_NAME = process.env.BUCKET_NAME;

let publishSNS = segment => {
  return new Promise((resolve, reject) => {
    console.log('publishing to SNS topic');
    let f = co.wrap(function* (subsegment) {
      let topicArn = `arn:aws:sns:${region}:${global.accountId}:lambda-x-ray-demo-${process.env.stage}`;
      let message = 'test';

      subsegment.addAnnotation('topic', topicArn);
      subsegment.addMetadata('message', 'test');

      let req = {
        Message: message,
        TopicArn: topicArn
      };
      yield sns.publishAsync(req);

      subsegment.close();
      resolve();
    });

    AWSXRay.captureAsyncFunc("## publishing to SNS", f, segment);
  });
};

let invokeLambda = segment => {
  return new Promise((resolve, reject) => {
    console.log('invoking Lambda function');

    let f = co.wrap(function* (subsegment) {
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

      subsegment.close();
      resolve();
    });

    AWSXRay.captureAsyncFunc("## invoking service-c", f, segment);
  });
};

let accessDynamoDB = segment => {
  return new Promise((resolve, reject) => {
    console.log('accessing DynamoDB');
    let f = co.wrap(function* (subsegment) {
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
      yield dynamodb.getAsync(getReq);

      let putReq = {
        TableName: table,
        Item: {
          id: value,
        }
      };
      yield dynamodb.putAsync(putReq);

      subsegment.close();
      resolve();
    });

    AWSXRay.captureAsyncFunc("## accessing DynamoDB", f, segment);
  });
};

let accessS3 = segment => {
  return new Promise((resolve, reject) => {
    console.log('accessing S3 buket');
    let f = co.wrap(function* (subsegment) {
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
      yield s3.getObjectAsync(getReq).catch(_ => { }); // swallow errors

      let putReq = {
        Body: body,
        Bucket: bucket,
        Key: key
      };
      yield s3.putObjectAsync(putReq);

      subsegment.close();
      resolve();
    });

    AWSXRay.captureAsyncFunc("## accessing S3", f, segment);
  });
};

let callServiceB = (segment, n) => {
  return new Promise((resolve, reject) => {
    console.log("service-a is going to call service-b");

    let f = co.wrap(function* (subsegment) {
      subsegment.addAnnotation('path', '/dev/demo/service-b');  // this works
      subsegment.addMetadata('random', n);                      // this works
      console.log(JSON.stringify(subsegment));

      let resp = yield utils.request('GET', global.hostname, '/dev/demo/service-b');

      console.log(resp);
      let body = JSON.parse(resp);

      subsegment.addMetadata('message', body.message);

      // remember to close subsegment or it won't show up in trace
      subsegment.close();
      resolve(body.message);
    });

    AWSXRay.captureAsyncFunc("## calling service b", f, segment);
  });
};

module.exports.handler = co.wrap(function* (event, context, callback) {
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
    yield publishSNS(segment);
    yield accessS3(segment);
    yield accessDynamoDB(segment);
    yield invokeLambda(segment);
    let message = yield callServiceB(segment, n);
    const response = {
      statusCode: 200,
      body: JSON.stringify({
        message: `service-b says ${message}`
      }),
    };

    console.log(JSON.stringify(segment));

    callback(null, response);
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