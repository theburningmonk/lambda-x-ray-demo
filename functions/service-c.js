'use strict';

const co      = require('co');
const Promise = require('bluebird');
const AWSXRay = require('aws-xray-sdk');
const AWS     = AWSXRay.captureAWS(require('aws-sdk'));
const sns     = Promise.promisifyAll(new AWS.SNS());
const region  = AWS.config.region;

let publishSNS = segment => {
  return new Promise((resolve, reject) => {
    console.log('publishing to SNS topic');
    let f = co.wrap(function* (subsegment) {
      let topicArn = `arn:aws:sns:${region}:${process.env.accountId}:lambda-x-ray-demo-${process.env.stage}`;
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

module.exports.handler = co.wrap(function* (event, context, callback) {
  console.log(JSON.stringify(event));
  console.log("service-c is a go");

  let segment = AWSXRay.getSegment();

  yield publishSNS(segment);

  callback(null, "foo");
});