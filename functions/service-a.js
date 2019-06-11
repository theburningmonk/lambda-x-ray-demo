const _        = require('lodash')
const utils    = require('./utils')
const AWSXRay  = require('aws-xray-sdk')
const AWS      = AWSXRay.captureAWS(require('aws-sdk'))
const sns      = new AWS.SNS()
const s3       = new AWS.S3()
const dynamodb = new AWS.DynamoDB.DocumentClient()
const lambda   = new AWS.Lambda()
const region   = AWS.config.region

const BUCKET_NAME = process.env.BUCKET_NAME

const publishSNS = segment => {
  return new Promise((resolve, reject) => {
    console.log('publishing to SNS topic')
    const f = async (subsegment) => {
      const topicArn = `arn:aws:sns:${region}:${global.accountId}:lambda-x-ray-demo-${process.env.stage}`
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

const invokeLambda = segment => {
  return new Promise((resolve, reject) => {
    console.log('invoking Lambda function')

    const f = async (subsegment) => {
      const funcName = `${process.env.service}-${process.env.stage}-service-c`
      subsegment.addAnnotation('function', funcName)

      const req = {
        FunctionName: funcName,
        InvocationType: "RequestResponse",
        Payload: ""
      }

      const resp = await lambda.invoke(req).promise()

      const respBody = resp.Payload.toString('utf8')
      subsegment.addMetadata('responseBody', respBody)

      subsegment.close()
      resolve()
    }

    AWSXRay.captureAsyncFunc("## invoking service-c", f, segment)
  })
}

const accessDynamoDB = segment => {
  return new Promise((resolve, reject) => {
    console.log('accessing DynamoDB')
    const f = async (subsegment) => {
      const table = `lambda-x-ray-demo-${process.env.stage}`
      const id = global.requestId
      const value = 'test'

      subsegment.addAnnotation('table', table)
      subsegment.addAnnotation('id', id)
      subsegment.addMetadata('value', value)

      const getReq = {
        TableName: table,
        Key: {
          id: value
        }
      }
      await dynamodb.get(getReq).promise()

      let putReq = {
        TableName: table,
        Item: {
          id: value,
        }
      }
      await dynamodb.put(putReq).promise()

      subsegment.close()
      resolve()
    }

    AWSXRay.captureAsyncFunc("## accessing DynamoDB", f, segment)
  })
}

const accessS3 = segment => {
  return new Promise((resolve, reject) => {
    console.log('accessing S3 buket')
    const f = async (subsegment) => {
      const bucket = BUCKET_NAME
      const key = `${global.requestId}.txt`
      const body = 'test'

      subsegment.addAnnotation('bucket', bucket)
      subsegment.addAnnotation('key', key)
      subsegment.addMetadata('body', body)

      const getReq = {
        Bucket: bucket,
        Key: key
      }
      await s3.getObject(getReq).promise().catch(_ => { }) // swallow errors

      const putReq = {
        Body: body,
        Bucket: bucket,
        Key: key
      }
      await s3.putObject(putReq).promise()

      subsegment.close()
      resolve()
    }

    AWSXRay.captureAsyncFunc("## accessing S3", f, segment)
  })
}

const callServiceB = (segment, n) => {
  return new Promise((resolve, reject) => {
    console.log("service-a is going to call service-b")

    const f = async (subsegment) => {
      subsegment.addAnnotation('path', '/dev/demo/service-b')  // this works
      subsegment.addMetadata('random', n)                      // this works
      console.log(JSON.stringify(subsegment))

      const resp = await utils.request('GET', global.hostname, '/dev/demo/service-b')

      console.log(resp)
      const body = JSON.parse(resp)

      subsegment.addMetadata('message', body.message)

      // remember to close subsegment or it won't show up in trace
      subsegment.close()
      resolve(body.message)
    }

    AWSXRay.captureAsyncFunc("## calling service b", f, segment)
  })
}

module.exports.handler = async (event, context) => {
  console.log(JSON.stringify(event))
  console.log(JSON.stringify(context))

  global.hostname = event.headers.Host
  global.accountId = event.requestContext.accountId
  global.requestId = event.requestContext.requestId

  const segment = AWSXRay.getSegment()
  console.log(JSON.stringify(segment))

  const n = _.get(event, 'queryStringParameters.n', 0)

  // metadata and annotation are only allowed in subsegments, so these two lines
  // won't work as they're adding to the root segment
  segment.addMetadata('random', `${n}`)
  segment.addAnnotation('path', event.path)

  if (n <= 1) {
    await publishSNS(segment)
    await accessS3(segment)
    await accessDynamoDB(segment)
    await invokeLambda(segment)
    let message = await callServiceB(segment, n)
    const response = {
      statusCode: 200,
      body: JSON.stringify({
        message: `service-b says ${message}`
      }),
    }

    console.log(JSON.stringify(segment))

    return response
  } else if (n <= 2) {
    console.log("service-a is going to call the timeout endpoint")
    await utils.request('GET', hostname, '/dev/demo/timeout')

    throw new Error("timed out")
  } else {
    console.log("service-a is going to call the error endpoint")
    await utils.request('GET', hostname, '/dev/demo/error')

    throw new Error("boom")
  }
}