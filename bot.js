import ethers from "ethers";
import express from "express";
import chalk from "chalk";
import abiDecoder from "abi-decoder";
const app = express();
let data = {
  WBNB: "0x2219845942d28716c0F7C605765fABDcA1a7d9E0", //wbnb

  TO_PURCHASE: "0x6d9eb0A1a559e7C80BD2fD689a13Bf479048130D", // token to purchase = BUSD for test 0xe9e7cea3dedca5984780bafc599bd69add087d56

  factory: "0xD68B1DCDe3bAeB3FF1483Ad33c3efC6B6e0A8E4C", //PancakeSwap V2 factory

  router: "0x2f46e5fF1F616cfc00F4e6fA2eFFbA4B0AAA7b6F", //PancakeSwap V2 router

  recipient: "0xf4Aff5AB04999B6194D26A186cBE3F81efE4553e", //your wallet address,

  AMOUNT_OF_WBNB: "3",

  Slippage: "5", //in Percentage

  gasPrice: 5, //in gwei

  gasLimit: "345684", //at least 21000

  minBnb: 2, //min liquidity added
};

let initialLiquidityDetected = false;
let jmlBnb = 0;
let listenOnPairCreated = false; //false if you wont to check
let frontrunSucceed = false;

// const bscMainnetUrl = 'https://bsc-dataseed1.defibit.io/'; //https://bsc-dataseed1.defibit.io/ https://bsc-dataseed.binance.org/
// const bscMainnetWss = 'wss://bsc-ws-node.nariox.org:443';

const bscMainnetUrl = "https://exchaintestrpc.okex.org";
const bscMainnetWss = "wss://exchaintestws.okex.org:8443";

const mnemonic = ""; //your memonic;
const privateKey =
  "0xa49e4185f5ceb20abb9e444e8792287379eeac74b19c70e3b3c23ffb018f27ed"; // your privateKey

var tokenIn = data.WBNB;
var tokenOut = data.TO_PURCHASE;
var GasPirce = data.gasPrice;

const provider = new ethers.providers.JsonRpcProvider(bscMainnetUrl);
const wssProvider = new ethers.providers.WebSocketProvider(bscMainnetWss);

const wallet = new ethers.Wallet(privateKey);
const account = wallet.connect(provider);

const factory = new ethers.Contract(
  data.factory,
  [
    "event PairCreated(address indexed token0, address indexed token1, address pair, uint)",
    "function getPair(address tokenA, address tokenB) external view returns (address pair)",
  ],
  account
);

const router = new ethers.Contract(
  data.router,
  [
    "function getAmountsOut(uint amountIn, address[] memory path) public view returns (uint[] memory amounts)",
    "function swapExactTokensForTokens(uint amountIn, uint amountOutMin, address[] calldata path, address to, uint deadline) external returns (uint[] memory amounts)",
    "function swapExactETHForTokens(uint amountOutMin, address[] calldata path, address to, uint deadline) external payable returns (uint[] memory amounts)",
  ],
  account
);

const erc = new ethers.Contract(
  data.WBNB,
  [
    {
      constant: true,
      inputs: [{ name: "_owner", type: "address" }],
      name: "balanceOf",
      outputs: [{ name: "balance", type: "uint256" }],
      payable: false,
      type: "function",
    },
    {
      constant: false,
      inputs: [
        { name: "spender", type: "address" },
        { name: "amount", type: "uint256" },
      ],
      name: "approve",
      outputs: [{ name: "", type: "bool" }],
      payable: false,
      type: "function",
    },
  ],
  account
);
async function approve() {
  return await erc.approve(
    data.router,
    "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"
  );
}

async function isPending(txHash) {
  return (await wssProvider.getTransactionReceipt(txHash)) == null;
}

var init = async () => {
  wssProvider.on("pending", function (txHash) {
    //console.log ('get ', txHash);
    wssProvider
      .getTransaction(txHash)
      .then(async function (tx) {
        if (tx) {
          //console.log (tx);
          console.log("TX hash: ", txHash); // transaction hash
          console.log("TX confirmation: ", tx.transactionIndex); // "null" when transaction is pending
          console.log("TX nonce: ", tx.nonce); // number of transactions made by the sender prior to this one
          console.log("TX block hash: ", tx.blockHash); // hash of the block where this transaction was in. "null" when transaction is pending
          console.log("TX block number: ", tx.blockNumber); // number of the block where this transaction was in. "null" when transaction is pending
          console.log("TX sender address: ", tx.from); // address of the sender
          console.log("Tx to address", tx.to);
          console.log("TX amount(in Ether): ", tx.value.toString());
          console.log("TX date: ", new Date()); // transaction date
          console.log("TX gas price: ", tx.gasPrice.toString() / 1e9); // gas price provided by the sender in wei
          console.log("TX data: ", tx.data); // the data sent along with the transaction.
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

async function handleTransaction(tx) {
  if (
    tx.to.toLowerCase() === data.router.toLowerCase() &&
    (await isPending(tx.hash))
  ) {
    console.log("Found pending pancakeswap tx", tx["hash"]);
  } else {
    return;
  }
  const input = tx.data;
  const txMethod = input.toLowerCase().substring(0, 10);
  console.log("kswap tx function method ", txMethod);
  if (txMethod == "0xf305d719" /*addLiquidityETH */) {
    console.log("enter---------------");
    const decodedData = abiDecoder.decodeMethod(input);
    const token = decodedData.params.filter((el) => el.name == "token")[0]
      .value;
    console.log("token name ", token);
    if (token.toLowerCase() === data.TO_PURCHASE.toLowerCase()) {
      // check liquidity
      jmlBnb = ethers.utils.formatEther(tx.value);
      // set same gasprice to follow addLiquidity tx
      gasPirce = tx.gasPrice / 1e9;
      console.log(gasPirce, "gasPirce=======");
      if (jmlBnb > data.minBnb) {
        await buyAction();
        frontrunSucceed = true;
      } else {
        console.log(
          "mempool found addLiquidity tx, but bnb is less than",
          jmlBnb,
          minBnb
        );
      }
    }
  }
}

const run = async () => {
  // check if liquidity added

  if (listenOnPairCreated === true) {
    factory.on("PairCreated", async (token0, token1, pairAddress) => {
      console.log("Pair Created...");
      if (token0 === data.WBNB && token1 === data.TO_PURCHASE) {
        tokenIn = token0;
        tokenOut = token1;
      }

      if (token1 == data.WBNB && token0 === data.TO_PURCHASE) {
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

let checkLiq = async () => {
  const pairAddressx = await factory.getPair(tokenIn, tokenOut);
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
  jmlBnb = ethers.utils.formatEther(pairBNBvalue);
  console.log(`value BNB : ${jmlBnb}`);

  if (jmlBnb > data.minBnb) {
    await buyAction();
  } else {
    initialLiquidityDetected = false;
    console.log(" run agaiin...");
    run();
  }
};

let buyAction = async () => {
  if (initialLiquidityDetected === true) {
    console.log("buy action already exec or not found...");
    return null;
  }

  console.log("beli");
  initialLiquidityDetected = true;
  // return 'ok beli';

  //We buy x amount of the new token for our wbnb
  const amountIn = ethers.utils.parseUnits(`${data.AMOUNT_OF_WBNB}`, "ether");
  const amounts = await router.getAmountsOut(amountIn, [tokenIn, tokenOut]);

  //Our execution price will be a bit different, we need some flexbility
  const amountOutMin = amounts[1].sub(amounts[1].div(`${data.Slippage}`));

  console.log(
    chalk.green.inverse(`Liquidity Addition Detected\n`) +
      `Buying Token
     =================
     tokenIn: ${amountIn.toString()} ${tokenIn} (WBNB)
     tokenOut: ${amountOutMin.toString()} ${tokenOut}
   `
  );
  console.log(GasPirce, "GasPirce=====");
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
  var tx;
  var bal = await erc.balanceOf(data.recipient);
  if (bal.toString() > amountIn) {
    console.log("enter swapExactTokensForTokens ----");
    tx = await router.swapExactTokensForTokens(
      amountIn,
      amountOutMin,
      [tokenIn, tokenOut],
      data.recipient,
      Date.now() + 1000 * 60 * 10, //10 minutes
      {
        gasLimit: data.gasLimit,
        gasPrice: ethers.utils.parseUnits(`${GasPirce}`, "gwei"),
      }
    );
  } else {
    console.log("enter swapExactETHForTokens ----");
    try {
      tx = await router.swapExactETHForTokens(
        amountOutMin,
        [tokenIn, tokenOut],
        data.recipient,
        Date.now() + 1000 * 60 * 10, //10 minutes
        {
          value: amountIn,
          gasLimit: data.gasLimit,
          gasPrice: ethers.utils.parseUnits(`${GasPirce}`, "gwei"),
        }
      );
    } catch (error) {}
  }
  console.log(tx, "=====");
  try {
    const receipt = await tx.wait();
    console.log("Transaction receipt", receipt);
  } catch (error) {}
};

//approve ();
//init ();
run();
let getGasPrice = async () => {
  let res = await axios.get("https://coinphd.com/api/bscgasprice");
  if (res.data.FastGasPrice) {
    data.gasPrice = res.data.FastGasPrice * 1.1;
  }
};
setInterval(() => {
  getGasPrice();
}, 5000);
// const PORT = 5000;

// app.listen (
//   PORT,
//   console.log (
//     chalk.yellow (
//       `Listening for Liquidity Addition to token ${data.TO_PURCHASE}`
//     )
//   )
// );
