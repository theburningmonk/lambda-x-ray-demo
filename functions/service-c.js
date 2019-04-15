const AWSXRay = require('aws-xray-sdk');
const AWS     = AWSXRay.captureAWS(require('aws-sdk'));
const sns     = new AWS.SNS();
const region  = AWS.config.region;

let publishSNS = segment => {
  return new Promise((resolve, reject) => {
    console.log('publishing to SNS topic');
    let f = async (subsegment) => {
      let topicArn = `arn:aws:sns:${region}:${process.env.accountId}:lambda-x-ray-demo-${process.env.stage}`;
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

module.exports.handler = async (event, context) => {
  console.log(JSON.stringify(event));
  console.log("service-c is a go");

  let segment = AWSXRay.getSegment();

  await publishSNS(segment);

  callback(null, "foo");
};