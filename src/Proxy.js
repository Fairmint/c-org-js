// Original source: https://github.com/OpenZeppelin/openzeppelin-sdk/blob/db559f81719644d0b4f703fb2055f32be94950fc/packages/lib/src/proxy/Proxy.ts

const IMPLEMENTATION_LABEL = "eip1967.proxy.implementation";
const ADMIN_LABEL = "eip1967.proxy.admin";

module.exports = class Proxy {
  constructor(web3, address) {
    this.web3 = web3;
    this.address = address;
  }

  async implementation() {
    return await this.getStorageAt(IMPLEMENTATION_LABEL);
  }

  async admin() {
    return await this.getStorageAt(ADMIN_LABEL);
  }

  async getStorageAt(label) {
    const hashedLabel = this.web3.utils.toHex(
      this.web3.utils
        .toBN(this.web3.utils.sha3(label))
        .sub(this.web3.utils.toBN(1))
    );
    const storage = await this.web3.eth.getStorageAt(this.address, hashedLabel);
    return this.uint256ToAddress(storage);
  }

  uint256ToAddress(uint256) {
    const padded = this.web3.utils.leftPad(uint256, 64);
    const address = padded.replace("0x000000000000000000000000", "0x");
    return this.web3.utils.toChecksumAddress(address);
  }
};
