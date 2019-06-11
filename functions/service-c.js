const AWSXRay = require('aws-xray-sdk')
const AWS     = AWSXRay.captureAWS(require('aws-sdk'))
const sns     = new AWS.SNS()
const region  = AWS.config.region

const publishSNS = segment => {
  return new Promise((resolve, reject) => {
    console.log('publishing to SNS topic')
    const f = async (subsegment) => {
      const topicArn = `arn:aws:sns:${region}:${process.env.accountId}:lambda-x-ray-demo-${process.env.stage}`
      const message = 'test'

      subsegment.addAnnotation('topic', topicArn)
      subsegment.addMetadata('message', 'test')

      const req = {
        Message: message,
        TopicArn: topicArn
      }
      await sns.publish(req).promise()

      subsegment.close()
      resolve()
    }

    AWSXRay.captureAsyncFunc("## publishing to SNS", f, segment)
  })
}

module.exports.handler = async (event, context) => {
  console.log(JSON.stringify(event))
  console.log("service-c is a go")

  const segment = AWSXRay.getSegment()

  await publishSNS(segment)

  return "foo"
}