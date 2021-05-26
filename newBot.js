import Web3 from "web3";

import { createRequire } from "module";

const require = createRequire(import.meta.url);
const factoryAbi = require("./abis/factoryAbi.json");
const privateKey = ''; 
const accountAddress = ''; 
const data = {
  SELL: "0x533367b864D9b9AA59D0DCB6554DF0C89feEF1fF", //sell token

  TO_PURCHASE: "0x86c6E07DC916A2C9e881c99e501bd709Efadc20F", // token to purchase = BUSD for test 0xe9e7cea3dedca5984780bafc599bd69add087d56

  factory: "0xD68B1DCDe3bAeB3FF1483Ad33c3efC6B6e0A8E4C", // factory

  router: "0x2f46e5fF1F616cfc00F4e6fA2eFFbA4B0AAA7b6F", // V2 router

  recipient: "0xE6Ea6c37273A8EcC289185c6DBD3E689a29C1478", //your wallet address,
};
const httpRPC = "https://exchaintestrpc.okex.org";
const wsRPC = "wss://exchaintestws.okex.org:8546";
let httpWeb3 = new Web3(new Web3.providers.HttpProvider(httpRPC));
const wsWeb3 = new Web3(new Web3.providers.WebsocketProvider(wsRPC));
let factory = new wsWeb3.eth.Contract(factoryAbi.abi, data.factory);
let router = new wsWeb3.eth.Contract(routerAbi.abi, data.router);
let erc = new httpWeb3.eth.Contract(ercAbi.abi, data.SELL);
console.log(factoryAbi);
function _promise(from, to, input) {
  return new Promise((resolve, reject) => {
    try {
      web3.eth.sendTransaction(
        {
          from: from,
          to: to,
          value: 0,
          input: input,
        },
        function (error, res) {
          if (!error) {
            const tval = setInterval(async () => {
              const tx = await web3.eth.getTransactionReceipt(res);
              if (tx) {
                console.log("tx:", tx);
                clearInterval(tval);
                resolve(res);
              }
            }, 500);
          } else {
            reject(error);
          }
        }
      );
    } catch (error) {
      reject(error);
    }
  });
}

async function isPending(txHash) {
  return (await wsWeb3.getTransactionReceipt(txHash)) == null;
}

let checkLiq = async () => {
  const pairAddressx = await factory.getPair(tokenIn, tokenOut).call();
  console.log(chalk.blue(`pairAddress: ${pairAddressx}`));
  if (pairAddressx !== null && pairAddressx !== undefined) {
    // console.log("pairAddress.toString().indexOf('0x0000000000000')", pairAddress.toString().indexOf('0x0000000000000'));
    if (pairAddressx.toString().indexOf("0x0000000000000") > -1) {
      console.log(
        chalk.red(`pairAddress ${pairAddressx} not detected. Restart me!`)
      );
      return await run();
    }
  }
  const pairBNBvalue = await erc.balanceOf(pairAddressx);
  jmlBnb = httpWeb3.utils.formatEther(pairBNBvalue) * 1e8;
  console.log(`value Token : ${jmlBnb}`);

  if (jmlBnb > data.minBnb) {
    await buyAction();
  } else {
    initialLiquidityDetected = false;
    console.log(" run again...");
    run();
  }
};
const run = async () => {
  // check if liquidity added

  if (listenOnPairCreated === true) {
    factory.on("PairCreated", async (token0, token1, pairAddress) => {
      console.log("Pair Created...");
      if (token0 === data.SELL && token1 === data.TO_PURCHASE) {
        tokenIn = token0;
        tokenOut = token1;
      }

      if (token1 == data.SELL && token0 === data.TO_PURCHASE) {
        tokenIn = token1;
        tokenOut = token0;
      }

      if (typeof tokenIn === "undefined") {
        console.log("token In", tokenIn, "udefined token");
        return "udefined token";
      }
      try {
        await checkLiq();
      } catch (e) {
        console.log("Err: " + e.message);
      }
    });
  } else {
    try {
      await checkLiq();
    } catch (e) {
      console.log("Err: " + e.message);
    }
  }
};

let buyAction = async () => {
  if (initialLiquidityDetected === true) {
    console.log("buy action already exec or not found...");
    return null;
  }

  initialLiquidityDetected = true;

  //We buy x amount of the new token for our sell token
  const amountIn = httpWeb3.utils.parseUnits(`${data.AMOUNT_OF_BUY}`, "ether");
  const amounts = await router.methods.getAmountsOut(amountIn, [tokenIn, tokenOut]).call();

  //Our execution price will be a bit different, we need some flexbility
  const amountOutMin = amounts[1].sub(amounts[1].div(`${data.Slippage}`));

  console.log(
    chalk.green.inverse(`Liquidity Addition Detected\n`) +
      `Buying Token
       =================
       tokenIn: ${amountIn.toString()} ${tokenIn} (base token)
       tokenOut: ${amountOutMin.toString()} ${tokenOut}
     `
  );
  console.log("GasPirce=====", GasPirce);
  console.log("Processing Transaction.....");
  console.log(chalk.yellow(`amountIn: ${amountIn}`));
  console.log(chalk.yellow(`amountOutMin: ${amountOutMin}`));
  console.log(chalk.yellow(`tokenIn: ${tokenIn}`));
  console.log(chalk.yellow(`tokenOut: ${tokenOut}`));
  console.log(chalk.yellow(`data.recipient: ${data.recipient}`));
  console.log(chalk.yellow(`data.gasLimit: ${data.gasLimit}`));
  console.log(
    chalk.yellow(`gasPrice: ${ethers.utils.parseUnits(`1000`, "gwei")}`)
  );

  console.log("enter swapExactTokensForTokens ----");
  const input = await router.methods
    .swapExactTokensForTokens(
      amountIn,
      amountOutMin,
      [tokenIn, tokenOut],
      data.recipient,
      Date.now() + 1000
    )
    .encodeABI();
  tx = await _promise(accountAddress, router._address, input);
  const receipt = await tx.wait();
  console.log("Transaction receipt", receipt);
};
let buyActionInMempool = async () => {
  if (initialLiquidityDetected === true) {
    console.log("buy action already exec or not found...");
    return null;
  }

  initialLiquidityDetected = true;

  //We buy x amount of the new token for our base token
  const amountIn = httpWeb3.utils.parseUnits(`${data.AMOUNT_OF_BUY}`, "ether");
  const amounts = await router
    .getAmountsOut(amountIn, [tokenIn, tokenOut])
    .call();

  //Our execution price will be a bit different, we need some flexbility
  const amountOutMin = amounts[1].sub(amounts[1].div(`${data.Slippage}`));

  console.log(
    chalk.green.inverse(`Liquidity Addition Detected\n`) +
      `Buying Token
       =================
       tokenIn: ${amountIn.toString()} ${tokenIn} (base token)
       tokenOut: ${amountOutMin.toString()} ${tokenOut}
     `
  );
  console.log("GasPirce=====", GasPirce);
  console.log("Processing Transaction.....");
  console.log(chalk.yellow(`amountIn: ${amountIn}`));
  console.log(chalk.yellow(`amountOutMin: ${amountOutMin}`));
  console.log(chalk.yellow(`tokenIn: ${tokenIn}`));
  console.log(chalk.yellow(`tokenOut: ${tokenOut}`));
  console.log(chalk.yellow(`data.recipient: ${data.recipient}`));
  console.log(chalk.yellow(`data.gasLimit: ${data.gasLimit}`));
  console.log(
    chalk.yellow(`gasPrice: ${ethers.utils.parseUnits(`${GasPirce}`, "gwei")}`)
  );

  console.log("enter swapExactTokensForTokens ----");
  const input = await router
    .swapExactTokensForTokens(
      amountIn,
      amountOutMin,
      [tokenIn, tokenOut],
      data.recipient,
      Date.now() + 1000
    )
    .encodeABI();
  const tx = await _promise(from, router._address, input);
  console.log("----", tx);
  const receipt = await tx.wait();
  console.log("Transaction receipt", receipt);
};
async function handleTransaction(tx) {
  if (
    tx.to.toLowerCase() === data.router.toLowerCase() &&
    (await isPending(tx.hash))
  ) {
    console.log("Found pending swap tx", tx["hash"]);
  } else {
    return;
  }
  const input = tx.data;
  const txMethod = input.toLowerCase().substring(0, 10);
  console.log("swap tx function method ", txMethod);

  if (txMethod == "0xe8e33700" /*addLiquidity */) {
    console.log("found addLiquidity ---------------");
    const decodedData = abiDecoder.decodeMethod(input);

    const tokenA = decodedData.params.filter((el) => el.name == "tokenA")[0]
      .value;
    const tokenB = decodedData.params.filter((el) => el.name == "tokenB")[0]
      .value;
    console.log("token name ", token);
    if (
      tokenA.toLowerCase() === data.TO_PURCHASE.toLowerCase() ||
      tokenB.toLowerCase() === data.TO_PURCHASE.toLocaleLowerCase()
    ) {
      GasPirce = tx.gasPrice / 1e9;
      await buyActionInMempool();
      frontrunSucceed = true;
    }
  }
}
var init = async () => {
  wsWeb3.on("pending", function (txHash) {
    //console.log ('get ', txHash);
    wsWeb3
      .getTransaction(txHash)
      .then(async function (tx) {
        if (tx) {
          //console.log (tx);
          console.log("TX hash: ", txHash);
          console.log("TX confirmation: ", tx.transactionIndex);
          console.log("TX nonce: ", tx.nonce);
          console.log("TX block hash: ", tx.blockHash);
          console.log("TX block number: ", tx.blockNumber);
          console.log("TX sender address: ", tx.from);
          console.log("Tx to address", tx.to);
          console.log("TX amount(in Ether): ", tx.value.toString());
          console.log("TX date: ", new Date());
          console.log("TX gas price: ", tx.gasPrice.toString() / 1e9);
          console.log("TX data: ", tx.data);
          console.log("====================================="); // a visual separator
        }
        await handleTransaction(tx);

        if (frontrunSucceed) {
          console.log("Front running attack succeed.");
          process.exit();
        }
      })
      .catch((error) => {
        console.log("tx not found----\n", error);
      });
  });
};

run();
