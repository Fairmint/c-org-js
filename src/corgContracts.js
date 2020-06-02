const abi = require("@fairmint/c-org-abi/abi.json");
const BigNumber = require("bignumber.js");
const constants = require("./constants");
const Web3 = require("web3");
const Proxy = require("./Proxy");

module.exports = class CorgContracts {
  /**
   * @param {object} web3 Expecting a web3 object or provider.
   * @param {string} address The DAT contract address.
   * @param {object} metadata An object with any additional info such as networkName.
   */
  constructor(web3, address, metadata) {
    this.web3 = new Web3(web3);
    this.dat = new this.web3.eth.Contract(abi.dat, address);
    this.metadata = metadata;
  }

  async _sendTx(tx, options) {
    const callOptions = Object.assign(
      {
        from: this.data.account.address,
        gasPrice: this.web3.utils.toWei("1.1", "Gwei"),
      },
      options
    );
    if (!callOptions.gas) {
      callOptions.gas = await tx.estimateGas(callOptions);
    }
    return new Promise((resolve, reject) => {
      tx.send(callOptions)
        .on("transactionHash", (tx) => {
          resolve(tx);
        })
        .on("error", (error) => {
          console.log(error);
          reject(error);
        });
    });
  }

  /**
   * @notice Call once after construction to pull data from the contract which can never change.
   */
  async init() {
    const [currencyAddress, whitelistAddress] = await Promise.all([
      this.dat.methods.currency().call(),
      this.dat.methods.whitelist().call(),
    ]);
    this.currency =
      currencyAddress && currencyAddress !== this.web3.utils.padLeft(0, 40)
        ? new this.web3.eth.Contract(abi.erc20, currencyAddress)
        : null;
    this.whitelist = new this.web3.eth.Contract(
      abi.whitelist,
      whitelistAddress
    );

    let currencyName, currencySymbol;

    try {
      // This reverts the ABI just in case it was previously changed in memory
      abi.erc20.find((e) => e.name === "name").outputs[0].type = "string";
      abi.erc20.find((e) => e.name === "symbol").outputs[0].type = "string";
      [currencyName, currencySymbol] = await Promise.all([
        this.currency ? this.currency.methods.name().call() : "Ether",
        this.currency ? this.currency.methods.symbol().call() : "ETH",
      ]);
    } catch (e) {
      // Some tokens, such as DAI, return bytes32 instead of a string
      abi.erc20.find((e) => e.name === "name").outputs[0].type = "bytes32";
      abi.erc20.find((e) => e.name === "symbol").outputs[0].type = "bytes32";
      this.currency = new this.web3.eth.Contract(abi.erc20, currencyAddress);
      [currencyName, currencySymbol] = await Promise.all([
        this.currency.methods.name().call(),
        this.currency.methods.symbol().call(),
      ]);
      currencySymbol = this.web3.utils.hexToUtf8(currencySymbol);
      currencyName = this.web3.utils.hexToUtf8(currencyName);
    }

    const datProxy = new Proxy(this.web3, this.dat._address);
    const whitelistProxy = new Proxy(this.web3, this.whitelist._address);

    const [
      decimals,
      currencyDecimals,
      name,
      symbol,
      buySlopeNum,
      buySlopeDen,
      initGoal,
      initReserve,
      investmentReserve,
      proxyImplementation,
      proxyAdmin,
      whitelistProxyImplementation,
      whitelistProxyAdmin,
    ] = await Promise.all([
      this.dat.methods.decimals().call(),
      this.currency ? this.currency.methods.decimals().call() : 18,
      this.dat.methods.name().call(),
      this.dat.methods.symbol().call(),
      this.dat.methods.buySlopeNum().call(),
      this.dat.methods.buySlopeDen().call(),
      this.dat.methods.initGoal().call(),
      this.dat.methods.initReserve().call(),
      this.dat.methods.investmentReserveBasisPoints().call(),
      datProxy.implementation(),
      datProxy.admin(),
      whitelistProxy.implementation(),
      whitelistProxy.admin(),
    ]);

    this.data = {
      decimals: parseInt(decimals),
      currency: {
        decimals: parseInt(currencyDecimals),
        name: currencyName,
        symbol: currencySymbol,
      },
      name,
      symbol,
      version: "2", // reading version dynamically fails in the browser
      proxyImplementation,
      proxyAdmin,
      whitelistProxyAddress: this.whitelist._address,
      whitelistProxyImplementation,
      whitelistProxyAdmin,
    };

    this.data.buySlope = new BigNumber(buySlopeNum)
      .shiftedBy(18 + 18 - this.data.currency.decimals)
      .div(buySlopeDen);
    this.data.initGoal = new BigNumber(initGoal).shiftedBy(-this.data.decimals);
    this.data.initReserve = new BigNumber(initReserve).shiftedBy(
      -this.data.decimals
    );
    this.data.investmentReserve = new BigNumber(investmentReserve).div(
      constants.BASIS_POINTS_DEN
    );
  }

  /**
   * @notice Call anytime to refresh information about the org.
   * @dev These values may change anytime any user has a transaction mined.
   */
  async refreshOrgInfo() {
    const [
      totalSupply,
      burnedSupply,
      beneficiary,
      control,
      feeCollector,
      autoBurn,
      buybackReserve,
      fee,
      revenueCommitment,
      minInvestment,
      openUntilAtLeast,
      stateId,
    ] = await Promise.all([
      this.dat.methods.totalSupply().call(),
      this.dat.methods.burnedSupply().call(),
      this.dat.methods.beneficiary().call(),
      this.dat.methods.control().call(),
      this.dat.methods.feeCollector().call(),
      this.dat.methods.autoBurn().call(),
      this.dat.methods.buybackReserve().call(),
      this.dat.methods.feeBasisPoints().call(),
      this.dat.methods.revenueCommitmentBasisPoints().call(),
      this.dat.methods.minInvestment().call(),
      this.dat.methods.openUntilAtLeast().call(),
      this.dat.methods.state().call(),
    ]);

    this.data.revenueCommitment = new BigNumber(revenueCommitment).div(
      constants.BASIS_POINTS_DEN
    );
    this.data.totalSupply = new BigNumber(totalSupply).shiftedBy(
      -this.data.decimals
    );
    this.data.burnedSupply = new BigNumber(burnedSupply).shiftedBy(
      -this.data.decimals
    );
    this.data.beneficiary = beneficiary;
    this.data.control = control;
    this.data.feeCollector = feeCollector;
    this.data.autoBurn = autoBurn;
    this.data.buybackReserve = new BigNumber(buybackReserve).shiftedBy(
      -this.data.currency.decimals
    );
    this.data.fee = new BigNumber(fee).div(constants.BASIS_POINTS_DEN);
    this.data.minInvestment = new BigNumber(minInvestment).shiftedBy(
      -this.data.currency.decimals
    );
    this.data.openUntilAtLeast = openUntilAtLeast;
    this.data.state = constants.STATES[stateId];

    // mintPrice. The price of the last transaction. For the preview, we can
    // safely calculate it with (total_supply+burnt_supply-init_reserve)*buy_slope durning
    // RUN (or CLOSE).  price=init_goal*buy_slope/2 during INIT (or CANCEL)
    if (this.data.state === "INIT" || this.data.state === "CANCEL") {
      this.data.mintPrice = this.data.initGoal.times(this.data.buySlope).div(2);
    } else {
      this.data.mintPrice = this.data.totalSupply
        .plus(this.data.burnedSupply)
        .minus(this.data.initReserve)
        .times(this.data.buySlope);
    }

    // lastTokenPrice will include 2nd hand markets in the future as well
    // at first it's always == mintPrice
    this.data.lastTokenPrice = this.data.mintPrice;

    this.data.marketCap = this.data.totalSupply.times(this.data.mintPrice);

    if (this.data.state === "INIT") {
      this.data.redeemPrice = this.data.mintPrice;
    } else {
      // redeemPrice
      // (total_supply+burnt_supply)*sell_slope + (sell_slope*burnt_supply^2)/(2*total_supply).
      // with sell_slope=((2*buyback_reserve)/((total_supply+burnt_supply)^2)))
      // (b^2 r)/(t (b + t)^2) + (2 r)/(b + t)
      if (this.data.totalSupply.plus(this.data.burnedSupply).eq(0)) {
        this.data.redeemPrice = new BigNumber(0);
      } else {
        this.data.redeemPrice = this.data.burnedSupply
          .pow(2)
          .times(this.data.buybackReserve)
          .div(
            this.data.burnedSupply
              .plus(this.data.totalSupply)
              .pow(2)
              .times(this.data.totalSupply)
          )
          .plus(
            this.data.buybackReserve
              .times(2)
              .div(this.data.burnedSupply.plus(this.data.totalSupply))
          );
      }
    }

    /**
     * Market sentiment
     * buyback_reserve = r
     * total_supply = t
     * burnt_supply = b
     * buy_slope = s
     *
     * source: ((t+b)*s)/((2*r/((t+b)^2))*(t+b)+((2*r/((t+b)^2))*b^2)/(2*t))
     * alternate: s t (b + t)^3 / (r (b^2 + 2 b t + 2 t^2))
     */
    if (this.data.state === "RUN") {
      this.data.marketSentiment = this.data.buySlope
        .times(this.data.totalSupply)
        .times(this.data.burnedSupply.plus(this.data.totalSupply).pow(3))
        .div(
          this.data.buybackReserve.times(
            this.data.burnedSupply
              .pow(2)
              .plus(
                this.data.burnedSupply.times(2).times(this.data.totalSupply)
              )
              .plus(this.data.totalSupply.pow(2).times(2))
          )
        );
    } else {
      // This value should not be displayed unless in the RUN state
      this.data.marketSentiment = null;
    }
  }

  /**
   * @notice Call anytime to refresh account information.
   * @dev These values may change anytime the user has a transaction mined.
   */
  async refreshAccountInfo(accountAddress) {
    const account = { address: accountAddress };
    const [
      ethBalance,
      fairBalance,
      userId,
      currencyBalance,
      allowance,
    ] = await Promise.all([
      this.web3.eth.getBalance(accountAddress),
      this.dat.methods.balanceOf(accountAddress).call(),
      this.whitelist.methods.authorizedWalletToUserId(accountAddress).call(),
      this.currency
        ? this.currency.methods.balanceOf(accountAddress).call()
        : undefined,
      this.currency
        ? this.currency.methods
            .allowance(accountAddress, this.dat._address)
            .call()
        : undefined,
    ]);
    account.ethBalance = new BigNumber(ethBalance).shiftedBy(-18);
    account.fairBalance = new BigNumber(fairBalance).shiftedBy(
      -this.data.decimals
    );
    account.whitelist = {
      userId,
    };
    if (userId !== constants.ZERO_ADDRESS) {
      const {
        jurisdictionId,
        totalTokensLocked,
        startIndex,
        endIndex,
      } = await this.whitelist.methods.getAuthorizedUserIdInfo(userId).call();
      account.whitelist.jurisdictionId = jurisdictionId;
      account.whitelist.totalTokensLocked = totalTokensLocked;
      account.whitelist.startIndex = startIndex;
      account.whitelist.endIndex = endIndex;
    } else {
      account.whitelist.jurisdictionId = 0;
      account.whitelist.totalTokensLocked = 0;
      account.whitelist.startIndex = 0;
      account.whitelist.endIndex = 0;
    }

    if (currencyBalance) {
      account.currencyBalance = new BigNumber(currencyBalance).shiftedBy(
        -this.data.currency.decimals
      );
      account.allowance = new BigNumber(allowance).shiftedBy(
        -this.data.currency.decimals
      );
    }

    this.data.account = account;
  }

  async approve(options) {
    return await this._sendTx(
      this.currency.methods.approve(this.dat._address, constants.MAX_UINT),
      options
    );
  }
  async approveNewUsers(accounts, jurisdictionIds, options) {
    return await this._sendTx(
      this.whitelist.methods.approveNewUsers(accounts, jurisdictionIds),
      options
    );
  }
  async estimateBuyValue(currencyAmount) {
    if (!currencyAmount) return 0;
    const currencyValue = new BigNumber(currencyAmount).shiftedBy(
      this.data.currency.decimals
    );
    const buyValue = await this.dat.methods
      .estimateBuyValue(currencyValue.toFixed())
      .call();
    return new BigNumber(buyValue).shiftedBy(-this.data.decimals);
  }
  async buy(currencyAmount, maxSlipPercent, sendToAddress, options) {
    let sendTo;
    if (sendToAddress && sendToAddress !== this.web3.utils.padLeft(0, 40)) {
      sendTo = sendToAddress;
    } else {
      sendTo = this.data.account.address;
    }
    const estimateBuyValue = await this.estimateBuyValue(currencyAmount);
    if (!estimateBuyValue || estimateBuyValue.eq(0))
      throw new Error("0 expected value");
    const currencyValue = new BigNumber(currencyAmount)
      .shiftedBy(this.data.currency.decimals)
      .dp(0);
    let minBuyValue = estimateBuyValue
      .times(new BigNumber(100).minus(maxSlipPercent).div(100))
      .shiftedBy(this.data.decimals)
      .dp(0);
    if (minBuyValue.lt(1)) {
      minBuyValue = new BigNumber(1);
    }

    return await this._sendTx(
      this.dat.methods.buy(
        sendTo,
        currencyValue.toFixed(),
        minBuyValue.toFixed()
      ),
      options
    );
  }
  async estimateSellValue(tokenAmount) {
    if (!tokenAmount) return 0;
    const tokenValue = new BigNumber(tokenAmount).shiftedBy(this.data.decimals);
    try {
      const sellValue = await this.dat.methods
        .estimateSellValue(tokenValue.toFixed())
        .call();
      return new BigNumber(sellValue).shiftedBy(-this.data.currency.decimals);
    } catch (e) {
      // likely > totalSupply
      return new BigNumber(0);
    }
  }
  async sell(tokenAmount, maxSlipPercent, sendToAddress, options) {
    tokenAmount = new BigNumber(tokenAmount);
    const estimateSellValue = await this.estimateSellValue(
      tokenAmount.toFixed()
    );
    if (!estimateSellValue || estimateSellValue.eq(0)) {
      throw new Error(
        `0 expected value from sell(${tokenAmount.toFixed()}, ${maxSlipPercent}, ${sendToAddress})`
      );
    }
    let sendTo;
    if (sendToAddress && sendToAddress !== this.web3.utils.padLeft(0, 40)) {
      sendTo = sendToAddress;
    } else {
      sendTo = this.data.account.address;
    }
    const tokenValue = tokenAmount.shiftedBy(this.data.decimals).dp(0);
    let minSellValue = estimateSellValue
      .times(new BigNumber(100).minus(maxSlipPercent).div(100))
      .shiftedBy(this.data.currency.decimals)
      .dp(0);
    if (minSellValue.lt(1)) {
      minSellValue = new BigNumber(1);
    }
    return await this._sendTx(
      this.dat.methods.sell(
        sendTo,
        tokenValue.toFixed(),
        minSellValue.toFixed()
      ),
      options
    );
  }
  async estimatePayValue(currencyAmount) {
    if (!currencyAmount) return 0;
    currencyAmount = new BigNumber(currencyAmount);
    const currencyValue = currencyAmount.shiftedBy(this.data.currency.decimals);
    const payValue = await this.dat.methods
      .estimatePayValue(currencyValue.toFixed())
      .call();
    return new BigNumber(payValue).shiftedBy(-this.data.decimals);
  }
  async pay(currencyAmount, sendToAddress, options) {
    currencyAmount = new BigNumber(currencyAmount);
    let sendTo;
    if (sendToAddress && sendToAddress !== this.web3.utils.padLeft(0, 40)) {
      sendTo = sendToAddress;
    } else {
      sendTo = this.data.account.address;
    }
    const currencyValue = currencyAmount
      .shiftedBy(this.data.currency.decimals)
      .dp(0);
    return await this._sendTx(
      this.dat.methods.pay(sendTo, currencyValue.toFixed()),
      options
    );
  }
  async estimateExitFee() {
    const exitFee = await this.dat.methods.estimateExitFee("0").call();
    return new BigNumber(exitFee).shiftedBy(-this.data.currency.decimals);
  }
  async close(options) {
    return await this._sendTx(this.dat.methods.close(), options);
  }
  async burn(tokenAmount, options) {
    const tokenValue = new BigNumber(tokenAmount)
      .shiftedBy(this.data.decimals)
      .dp(0);
    return await this._sendTx(
      this.dat.methods.burn(tokenValue.toFixed()),
      options
    );
  }
  /**
   *
   * @param spender address of the account which will be able to spend your tokens
   * @param expiry the timestamp in seconds for when the signed message is valid until
   * @param allowed `true` to approve(-1) and `false` to approve(0) which removes approval
   */
  async signPermit(spender, expiry, allowed) {
    // Original source: https://medium.com/metamask/eip712-is-coming-what-to-expect-and-how-to-use-it-bb92fd1a7a26
    const domain = [
      { name: "name", type: "string" },
      { name: "version", type: "string" },
      { name: "chainId", type: "uint256" },
      { name: "verifyingContract", type: "address" },
    ];
    const permit = [
      { name: "holder", type: "address" },
      { name: "spender", type: "address" },
      { name: "nonce", type: "uint256" },
      { name: "expiry", type: "uint256" },
      { name: "allowed", type: "bool" },
    ];
    const domainData = {
      name: this.data.name,
      version: this.data.version,
      chainId: parseInt(web3.version.network, 10),
      verifyingContract: this.dat._address,
    };
    const message = {
      holder: this.data.account.address,
      spender,
      nonce: await this.dat.methods.nonces(this.data.account.address).call(),
      expiry,
      allowed,
    };
    const data = JSON.stringify({
      types: {
        EIP712Domain: domain,
        Permit: permit,
      },
      domain: domainData,
      primaryType: "Permit",
      message,
    });
    return await new Promise((reject, resolve) => {
      web3.currentProvider.sendAsync(
        {
          method: "eth_signTypedData_v4",
          params: [this.data.account.address, data],
          from: this.data.account.address,
        },
        function (err, result) {
          if (err) {
            return reject(err);
          }
          const signature = result.result.substring(2);
          const r = "0x" + signature.substring(0, 64);
          const s = "0x" + signature.substring(64, 128);
          const v = parseInt(signature.substring(128, 130), 16);
          // The signature is now comprised of r, s, and v.
          return resolve(
            Object.assign(message, {
              signature: {
                v,
                r,
                s,
              },
            })
          );
        }
      );
    });
  }
  async sendPermit(
    { holder, spender, nonce, expiry, allowed, signature },
    options
  ) {
    return await this._sendTx(
      this.dat.methods.permit(
        holder,
        spender,
        nonce,
        expiry,
        allowed,
        signature.v,
        signature.r,
        signature.s
      ),
      options
    );
  }
};
