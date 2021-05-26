import fs from "fs";
import axios from "axios";
// import { config } from "./config.js";
// const REDIS_PORT = config.REDIS_PORT;
// const client = redis.createClient();
let getGasPrice = async () => {
  let res = await axios.get("https://coinphd.com/api/bscgasprice");
  if (res.data.FastGasPrice) {
    fs.writeFile(
      "gasInfo.js",
     "export default " + JSON.stringify(res.data) + ";",
      () => {
        console.log(res);
      }
    );
  }
};
setInterval(() => {
  getGasPrice();
}, 1000);
// client.on("error", function(error) {
//     console.error(error);
//   });
// client.on('ready',function(res){
//     console.log('ready');
// });
// client.set("gasPrice", getGasPrice(), function (res) {
//   console.log(res);
// });
