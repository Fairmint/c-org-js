const abi = require("@fairmint/c-org-abi/abi.json");
const BigNumber = require("bignumber.js");
const constants = require("./constants");
const { Networks } = require("../index");
const network = Networks.find(e => e.name === "mainnet");
const { protocols } = require("hardlydifficult-ethereum-contracts");

module.exports = class Uniswap {
  
  constructor(address) {
    this.web3 = new Web3(network.provider);
    const uniswap = await protocols.uniswap.at(web3, protocolOwner);
  }

  async getEthToUSDC() {
    const value = await exchange.getEthToTokenInputPrice(
      web3.utils.toWei("1", "ether")
    );
    return value;
      await this.dat.methods.totalSupply().call(),
      this.dat.methods.burnedSupply().call(),
      this.dat.methods.name().call(),
      this.dat.methods.symbol().call(),
      this.dat.methods.beneficiary().call(),
      this.dat.methods.control().call(),
      this.dat.methods.feeCollector().call(),
      this.dat.methods.autoBurn().call(),
      this.dat.methods.buybackReserve().call(),
      this.dat.methods.feeBasisPoints().call(),
      this.dat.methods.revenueCommitmentBasisPoints().call(),
      this.dat.methods.minInvestment().call(),
      this.dat.methods.openUntilAtLeast().call(),
      this.dat.methods.state().call()
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
    this.data.name = name;
    this.data.symbol = symbol;
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

    // Live FAIR price. The price of the last transaction. For the preview, we can
    // safely calculate it with (total_supply+burnt_supply)*buy_slope durning RUN (or CLOSE).
    // price=init_goal*buy_slope/2 during INIT (or CANCEL)
    if (this.data.state === "INIT" || this.data.state === "CANCEL") {
      this.data.liveFAIRPrice = this.data.initGoal
        .times(this.data.buySlope)
        .div(2);
    } else {
      this.data.liveFAIRPrice = this.data.totalSupply
        .plus(this.data.burnedSupply)
        .times(this.data.buySlope);
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
};
