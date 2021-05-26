import ethers from 'ethers';
import chalk from 'chalk';
import abiDecoder from 'abi-decoder';
import axios from 'axios';

const privateKey = ''; // your privateKey

// binance
// const data = {
//   SELL: '0x55d398326f99059fF775485246999027B3197955', //sell token

//   TO_PURCHASE: '0x84ab3da404041c0776e4f3eb9492f9e5701503fe', // token to purchase = BUSD for test 0xe9e7cea3dedca5984780bafc599bd69add087d56

//   factory: '0xca143ce32fe78f1f7019d7d551a6402fc5350c73', // factory

//   router: '0x10ED43C718714eb63d5aA57B78B54704E256024E', // V2 router

//   recipient: '0x731cc3aef26985435A416e531f60784eAAB770B1', //your wallet address,

//   AMOUNT_OF_BUY: '498',

//   Slippage: '30', //in Percentage

//   gasPrice: 6, //in gwei

//   gasLimit: '445684', //at least 21000

//   minBnb: 100, //min liquidity added
// };
// const bscMainnetUrl = 'https://bsc-dataseed1.defibit.io/'; //https://bsc-dataseed1.defibit.io/ https://bsc-dataseed.binance.org/
// const bscMainnetWss = 'wss://bsc-ws-node.nariox.org:443';

// okexchain
const data = {
  SELL: '0x533367b864D9b9AA59D0DCB6554DF0C89feEF1fF', //sell token

  TO_PURCHASE: '0x86c6E07DC916A2C9e881c99e501bd709Efadc20F', // token to purchase = BUSD for test 0xe9e7cea3dedca5984780bafc599bd69add087d56

  factory: '0xD68B1DCDe3bAeB3FF1483Ad33c3efC6B6e0A8E4C', // factory

  router: '0x2f46e5fF1F616cfc00F4e6fA2eFFbA4B0AAA7b6F', // V2 router

  recipient: '0xE6Ea6c37273A8EcC289185c6DBD3E689a29C1478', //your wallet address,

  AMOUNT_OF_BUY: '500',

  Slippage: '30', //in Percentage

  gasPrice: 6, //in gwei

  gasLimit: '445684', //at least 21000

  minBnb: 1, //min liquidity added
};
const bscMainnetUrl = 'https://exchaintestrpc.okex.org';
const bscMainnetWss = 'wss://exchaintestws.okex.org:8443';

let initialLiquidityDetected = false;
let jmlBnb = 0;
let listenOnPairCreated = false; //false if you wont to check
let frontrunSucceed = false;

var tokenIn = data.SELL;
var tokenOut = data.TO_PURCHASE;
var GasPirce = data.gasPrice;

const provider = new ethers.providers.JsonRpcProvider (bscMainnetUrl);
const wssProvider = new ethers.providers.WebSocketProvider (bscMainnetWss);

const wallet = new ethers.Wallet (privateKey);
const account = wallet.connect (provider);

const factory = new ethers.Contract (
  data.factory,
  [
    'event PairCreated(address indexed token0, address indexed token1, address pair, uint)',
    'function getPair(address tokenA, address tokenB) external view returns (address pair)',
  ],
  account
);

const router = new ethers.Contract (
  data.router,
  [
    'function getAmountsOut(uint amountIn, address[] memory path) public view returns (uint[] memory amounts)',
    'function swapExactTokensForTokens(uint amountIn, uint amountOutMin, address[] calldata path, address to, uint deadline) external returns (uint[] memory amounts)',
    'function swapExactETHForTokens(uint amountOutMin, address[] calldata path, address to, uint deadline) external payable returns (uint[] memory amounts)',
  ],
  account
);

const erc = new ethers.Contract (
  data.SELL,
  [
    {
      constant: true,
      inputs: [{name: '_owner', type: 'address'}],
      name: 'balanceOf',
      outputs: [{name: 'balance', type: 'uint256'}],
      payable: false,
      type: 'function',
    },
    {
      constant: false,
      inputs: [
        {name: 'spender', type: 'address'},
        {name: 'amount', type: 'uint256'},
      ],
      name: 'approve',
      outputs: [{name: '', type: 'bool'}],
      payable: false,
      type: 'function',
    },
  ],
  account
);

async function isPending (txHash) {
  return (await wssProvider.getTransactionReceipt (txHash)) == null;
}

var init = async () => {
  wssProvider.on ('pending', function (txHash) {
    //console.log ('get ', txHash);
    wssProvider
      .getTransaction (txHash)
      .then (async function (tx) {
        if (tx) {
          //console.log (tx);
          console.log ('TX hash: ', txHash);
          console.log ('TX confirmation: ', tx.transactionIndex);
          console.log ('TX nonce: ', tx.nonce);
          console.log ('TX block hash: ', tx.blockHash);
          console.log ('TX block number: ', tx.blockNumber);
          console.log ('TX sender address: ', tx.from);
          console.log ('Tx to address', tx.to);
          console.log ('TX amount(in Ether): ', tx.value.toString ());
          console.log ('TX date: ', new Date ());
          console.log ('TX gas price: ', tx.gasPrice.toString () / 1e9);
          console.log ('TX data: ', tx.data);
          console.log ('====================================='); // a visual separator
        }
        await handleTransaction (tx);

        if (frontrunSucceed) {
          console.log ('Front running attack succeed.');
          process.exit ();
        }
      })
      .catch (error => {
        console.log ('tx not found----\n', error);
      });
  });
};

async function handleTransaction (tx) {
  if (
    tx.to.toLowerCase () === data.router.toLowerCase () &&
    (await isPending (tx.hash))
  ) {
    console.log ('Found pending swap tx', tx['hash']);
  } else {
    return;
  }
  const input = tx.data;
  const txMethod = input.toLowerCase ().substring (0, 10);
  console.log ('swap tx function method ', txMethod);

  // if (txMethod == '0xf305d719' /*addLiquidityETH */) {
  //   console.log ('enter---------------');
  //   const decodedData = abiDecoder.decodeMethod (input);
  //   const token = decodedData.params.filter (el => el.name == 'token')[0].value;
  //   console.log ('token name ', token);
  //   if (token.toLowerCase () === data.TO_PURCHASE.toLowerCase ()) {
  //     // check liquidity
  //     jmlBnb = ethers.utils.formatEther (tx.value);
  //     // set same gasprice to follow addLiquidity tx
  //     GasPirce = tx.gasPrice / 1e9;
  //     console.log (gasPirce, 'gasPirce=======');
  //     if (jmlBnb > data.minBnb) {
  //       await buyAction ();
  //       frontrunSucceed = true;
  //     } else {
  //       console.log (
  //         'mempool found addLiquidity tx, but bnb is less than',
  //         jmlBnb,
  //         minBnb
  //       );
  //     }
  //   }
  //  }

  if (txMethod == '0xe8e33700' /*addLiquidity */) {
    console.log ('found addLiquidity ---------------');
    const decodedData = abiDecoder.decodeMethod (input);

    const tokenA = decodedData.params.filter (el => el.name == 'tokenA')[0]
      .value;
    const tokenB = decodedData.params.filter (el => el.name == 'tokenB')[0]
      .value;
    console.log ('token name ', token);
    if (
      tokenA.toLowerCase () === data.TO_PURCHASE.toLowerCase () ||
      tokenB.toLowerCase () === data.TO_PURCHASE.toLocaleLowerCase ()
    ) {
      GasPirce = tx.gasPrice / 1e9;
      await buyActionInMempool ();
      frontrunSucceed = true;
    }
  }
}

const run = async () => {
  // check if liquidity added

  if (listenOnPairCreated === true) {
    factory.on ('PairCreated', async (token0, token1, pairAddress) => {
      console.log ('Pair Created...');
      if (token0 === data.SELL && token1 === data.TO_PURCHASE) {
        tokenIn = token0;
        tokenOut = token1;
      }

      if (token1 == data.SELL && token0 === data.TO_PURCHASE) {
        tokenIn = token1;
        tokenOut = token0;
      }

      if (typeof tokenIn === 'undefined') {
        console.log ('token In', tokenIn, 'udefined token');
        return 'udefined token';
      }
      try {
        await checkLiq ();
      } catch (e) {
        console.log ('Err: ' + e.message);
      }
    });
  } else {
    try {
      await checkLiq ();
    } catch (e) {
      console.log ('Err: ' + e.message);
    }
  }
};

let checkLiq = async () => {
  const pairAddressx = await factory.getPair (tokenIn, tokenOut);
  console.log (chalk.blue (`pairAddress: ${pairAddressx}`));
  if (pairAddressx !== null && pairAddressx !== undefined) {
    // console.log("pairAddress.toString().indexOf('0x0000000000000')", pairAddress.toString().indexOf('0x0000000000000'));
    if (pairAddressx.toString ().indexOf ('0x0000000000000') > -1) {
      console.log (
        chalk.red (`pairAddress ${pairAddressx} not detected. Restart me!`)
      );
      return await run ();
    }
  }
  const pairBNBvalue = await erc.balanceOf (pairAddressx);
  jmlBnb = ethers.utils.formatEther (pairBNBvalue) * 1e8;
  console.log (`value Token : ${jmlBnb}`);

  if (jmlBnb > data.minBnb) {
    await buyAction ();
  } else {
    initialLiquidityDetected = false;
    console.log (' run again...');
    run ();
  }
};

let buyAction = async () => {
  if (initialLiquidityDetected === true) {
    console.log ('buy action already exec or not found...');
    return null;
  }

  initialLiquidityDetected = true;

  //We buy x amount of the new token for our sell token
  const amountIn = ethers.utils.parseUnits (`${data.AMOUNT_OF_BUY}`, 'ether');
  const amounts = await router.getAmountsOut (amountIn, [tokenIn, tokenOut]);

  //Our execution price will be a bit different, we need some flexbility
  const amountOutMin = amounts[1].sub (amounts[1].div (`${data.Slippage}`));

  console.log (
    chalk.green.inverse (`Liquidity Addition Detected\n`) +
      `Buying Token
     =================
     tokenIn: ${amountIn.toString ()} ${tokenIn} (base token)
     tokenOut: ${amountOutMin.toString ()} ${tokenOut}
   `
  );
  console.log ('GasPirce=====', GasPirce);
  console.log ('Processing Transaction.....');
  console.log (chalk.yellow (`amountIn: ${amountIn}`));
  console.log (chalk.yellow (`amountOutMin: ${amountOutMin}`));
  console.log (chalk.yellow (`tokenIn: ${tokenIn}`));
  console.log (chalk.yellow (`tokenOut: ${tokenOut}`));
  console.log (chalk.yellow (`data.recipient: ${data.recipient}`));
  console.log (chalk.yellow (`data.gasLimit: ${data.gasLimit}`));
  console.log (
    chalk.yellow (`gasPrice: ${ethers.utils.parseUnits (`1000`, 'gwei')}`)
  );

  console.log ('enter swapExactTokensForTokens ----');
  var tx = await router.swapExactTokensForTokens (
    amountIn,
    amountOutMin,
    [tokenIn, tokenOut],
    data.recipient,
    Date.now () + 1000,
    {
      gasLimit: data.gasLimit,
      gasPrice: ethers.utils.parseUnits (`1000`, 'gwei'),
    }
  );
  const receipt = await tx.wait ();
  console.log ('Transaction receipt', receipt);
};

let buyActionInMempool = async () => {
  if (initialLiquidityDetected === true) {
    console.log ('buy action already exec or not found...');
    return null;
  }

  initialLiquidityDetected = true;

  //We buy x amount of the new token for our base token
  const amountIn = ethers.utils.parseUnits (`${data.AMOUNT_OF_BUY}`, 'ether');
  const amounts = await router.getAmountsOut (amountIn, [tokenIn, tokenOut]);

  //Our execution price will be a bit different, we need some flexbility
  const amountOutMin = amounts[1].sub (amounts[1].div (`${data.Slippage}`));

  console.log (
    chalk.green.inverse (`Liquidity Addition Detected\n`) +
      `Buying Token
     =================
     tokenIn: ${amountIn.toString ()} ${tokenIn} (base token)
     tokenOut: ${amountOutMin.toString ()} ${tokenOut}
   `
  );
  console.log ('GasPirce=====', GasPirce);
  console.log ('Processing Transaction.....');
  console.log (chalk.yellow (`amountIn: ${amountIn}`));
  console.log (chalk.yellow (`amountOutMin: ${amountOutMin}`));
  console.log (chalk.yellow (`tokenIn: ${tokenIn}`));
  console.log (chalk.yellow (`tokenOut: ${tokenOut}`));
  console.log (chalk.yellow (`data.recipient: ${data.recipient}`));
  console.log (chalk.yellow (`data.gasLimit: ${data.gasLimit}`));
  console.log (
    chalk.yellow (
      `gasPrice: ${ethers.utils.parseUnits (`${GasPirce}`, 'gwei')}`
    )
  );

  console.log ('enter swapExactTokensForTokens ----');
  var tx = await router.swapExactTokensForTokens (
    amountIn,
    amountOutMin,
    [tokenIn, tokenOut],
    data.recipient,
    Date.now () + 1000,
    {
      gasLimit: data.gasLimit,
      gasPrice: ethers.utils.parseUnits (`${GasPirce}`, 'gwei'),
    }
  );
  console.log ('----', tx);
  const receipt = await tx.wait ();
  console.log ('Transaction receipt', receipt);
};

//init ();
run ();

// setInterval (() => {
//   getGasPrice ();
// }, 6000);

// let getGasPrice = async () => {
//   let res = await axios.get ('https://coinphd.com/api/bscgasprice');
//   if (res.data.FastGasPrice) {
//     GasPirce = res.data.FastGasPrice;
//     console.log ('------ GasPirce', GasPirce);
//   }
// };
