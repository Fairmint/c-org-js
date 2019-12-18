const cOrgAbi = require("@fairmint/c-org-abi/abi.json");
const cOrgBytecode = require("@fairmint/c-org-abi/bytecode.json");
const { helpers } = require("hardlydifficult-ethereum-contracts");
const Web3 = require("web3");

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
async function getDat(web3, datAddress) {
  web3 = new Web3(web3);
  return await helpers.truffleContract.at(web3, cOrgAbi.dat, datAddress);
}
async function getWhitelist(web3, whitelistAddress) {
  web3 = new Web3(web3);
  return await helpers.truffleContract.at(
    web3,
    cOrgAbi.whitelist,
    whitelistAddress
  );
}
async function getProxyAdmin(web3, proxyAdminAddress) {
  web3 = new Web3(web3);
  return await helpers.truffleContract.at(
    web3,
    cOrgAbi.proxyAdmin,
    proxyAdminAddress
  );
}
async function waitForDeploy(tx) {
  const hash = await tx;
  let receipt;
  do {
    await sleep(1500);
    receipt = await web3.eth.getTransactionReceipt(hash);
  } while (receipt === null);
  return receipt.contractAddress;
}
function deployContract(web3, from, abi, options) {
  web3 = new Web3(web3);
  return new Promise((resolve, reject) => {
    const txObj = new web3.eth.Contract(abi).deploy(options);
    return txObj.estimateGas().then(gas => {
      return txObj
        .send({
          from,
          gas
        })
        .on("transactionHash", tx => {
          return resolve(tx);
        })
        .on("error", error => {
          return reject(error);
        });
    });
  });
}
function deployDatTemplate(web3, from) {
  web3 = new Web3(web3);
  return deployContract(web3, from, cOrgAbi.dat, { data: cOrgBytecode.dat });
}
function deployWhitelistTemplate(web3, from) {
  web3 = new Web3(web3);
  return deployContract(web3, from, cOrgAbi.whitelist, {
    data: cOrgBytecode.whitelist
  });
}
function deployProxyAdmin(web3, from) {
  web3 = new Web3(web3);
  return deployContract(web3, from, cOrgAbi.proxyAdmin, {
    data: cOrgBytecode.proxyAdmin
  });
}
function deployProxy(web3, from, templateAddress, adminAddress) {
  web3 = new Web3(web3);
  return deployContract(web3, from, cOrgAbi.proxy, {
    data: cOrgBytecode.proxy,
    arguments: [templateAddress, adminAddress, "0x"]
  });
}
async function initializeDat(web3, from, datProxyAddress, options) {
  web3 = new Web3(web3);
  const callOptions = Object.assign(
    {
      initReserve: "42000000000000000000",
      currency: "0x0000000000000000000000000000000000000000",
      initGoal: "0",
      buySlopeNum: "1",
      buySlopeDen: "100000000000000000000",
      investmentReserveBasisPoints: "1000",
      name: "FAIR token",
      symbol: "FAIR"
    },
    options
  );
  const dat = await getDat(web3, datProxyAddress);
  await dat.initialize(
    callOptions.initReserve,
    callOptions.currency,
    callOptions.initGoal,
    callOptions.buySlopeNum,
    callOptions.buySlopeDen,
    callOptions.investmentReserveBasisPoints,
    callOptions.name,
    callOptions.symbol,
    { from }
  );
}
async function updateDat(web3, from, datProxyAddress, options) {
  web3 = new Web3(web3);
  const callOptions = Object.assign(
    {
      revenueCommitmentBasisPoints: "1000",
      feeBasisPoints: "0",
      burnThresholdBasisPoints: false,
      minInvestment: "1",
      openUntilAtLeast: "0",
      beneficiary: options.control,
      feeCollector: options.control
    },
    options
  );
  const dat = await getDat(web3, datProxyAddress);
  await dat.updateConfig(
    callOptions.whitelistAddress,
    callOptions.beneficiary,
    callOptions.control,
    callOptions.feeCollector,
    callOptions.feeBasisPoints,
    callOptions.autoBurn,
    callOptions.revenueCommitmentBasisPoints,
    callOptions.minInvestment,
    callOptions.openUntilAtLeast,
    {
      from
    }
  );
}
async function initializeWhitelist(
  web3,
  from,
  whitelistProxyAddress,
  datProxyAddress
) {
  web3 = new Web3(web3);
  const whitelist = await getWhitelist(web3, whitelistProxyAddress);
  await whitelist.initialize(datProxyAddress, { from });
}
async function whitelistApprove(web3, from, whitelistProxyAddress, account) {
  web3 = new Web3(web3);
  const whitelist = await getWhitelist(web3, whitelistProxyAddress);
  await whitelist.approve(account, true, {
    from
  });
}
async function whitelistTransferOwnership(
  web3,
  from,
  whitelistProxyAddress,
  newOwner
) {
  web3 = new Web3(web3);
  const whitelist = await getWhitelist(web3, whitelistProxyAddress);
  await whitelist.transferOwnership(newOwner, {
    from
  });
}
async function proxyAdminTransferOwnership(
  web3,
  from,
  proxyAdminAddress,
  newOwner
) {
  web3 = new Web3(web3);
  const proxyAdmin = await getProxyAdmin(web3, proxyAdminAddress);
  await proxyAdmin.transferOwnership(newOwner, { from });
}

module.exports = {
  // 1)
  deployDatTemplate,
  // 2)
  deployWhitelistTemplate,
  // 3)
  deployProxyAdmin,
  // 4) 5)
  deployProxy,
  // 6)
  initializeDat,
  // 7)
  initializeWhitelist,
  // 8-11)
  whitelistApprove,
  // 12)
  updateDat,
  // 13)
  whitelistTransferOwnership,
  // 14)
  proxyAdminTransferOwnership,
  deploy: async (web3, options) => {
    // Once per network:
    // 1) deploy dat template
    //   - enter address
    // 2) deploy whitelist template
    //   - enter address

    // Once per dat:
    // 3) deploy proxy admin
    //   - enter address
    // 4) deploy dat proxy(datTemplate.address, proxyAdmin.address)
    //   - enter address
    // 5) deploy whitelist proxy(whitelistTemplate.address, proxyAdmin.address)
    //   - enter address
    // 6) datProxy.initialize(datFixedSettings)
    //   - display: initialized
    // 7) whitelistProxy.initialize(datProxy.address)
    //   - display: initialized
    // 8-11) whitelist.approve(dat, control, beneficiary, feeCollector)
    // 12) datProxy.updateConfig(whitelistProxy.address, datUpdatableSettings)
    //   - no change (just display all settings)
    //   - include new control account address
    // 13) whitelistProxy.transferOwnership(new control address)
    //   - no change (just display all settings)
    // 14) proxyAdmin.transferOwnership(new control address)
    //   - no change (just display all settings)

    const datTemplateAddress = await waitForDeploy(
      deployDatTemplate(web3, options.control)
    );
    const whitelistTemplateAddress = await waitForDeploy(
      deployWhitelistTemplate(web3, options.control)
    );
    const proxyAdminAddress = await waitForDeploy(
      deployProxyAdmin(web3, options.control)
    );
    const datProxyAddress = await waitForDeploy(
      deployProxy(web3, options.control, datTemplateAddress, proxyAdminAddress)
    );
    const whitelistProxyAddress = await waitForDeploy(
      deployProxy(
        web3,
        options.control,
        whitelistTemplateAddress,
        proxyAdminAddress
      )
    );

    options.whitelistAddress = whitelistProxyAddress;
    await initializeDat(web3, options.control, datProxyAddress, options);

    await initializeWhitelist(
      web3,
      options.control,
      whitelistProxyAddress,
      datProxyAddress
    );
    await whitelistApprove(
      web3,
      options.control,
      whitelistProxyAddress,
      datProxyAddress
    );
    await whitelistApprove(
      web3,
      options.control,
      whitelistProxyAddress,
      options.control
    );
    if (options.beneficiary && options.beneficiary !== options.control) {
      await whitelistApprove(
        web3,
        options.control,
        whitelistProxyAddress,
        options.beneficiary
      );
    }
    if (options.feeCollector && options.feeCollector !== options.control) {
      await whitelistApprove(
        web3,
        options.control,
        whitelistProxyAddress,
        options.feeCollector
      );
    }

    await updateDat(web3, options.control, datProxyAddress, options);

    const dat = await getDat(web3, datProxyAddress);
    const whitelist = await getWhitelist(web3, whitelistProxyAddress);
    return { dat, whitelist };
  },
  getDat,
  getWhitelist
};
