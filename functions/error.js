module.exports.handler = async (event) => {
  console.log(JSON.stringify(event))
  console.log("this is going to error...")

  throw new Error("boom")
}