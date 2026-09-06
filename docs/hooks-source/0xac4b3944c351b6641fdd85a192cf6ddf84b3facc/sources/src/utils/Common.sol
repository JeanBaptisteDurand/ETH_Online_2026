// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.26;

import {IAllowanceTransfer} from "@uniswap/permit2/src/interfaces/IAllowanceTransfer.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @title Common
/// @notice Shared constants, errors, and helper utilities used across protocol contracts.
contract Common {
    /*//////////////////////////////////////////////////////////////
                                CONSTANTS
    //////////////////////////////////////////////////////////////*/
    /// @notice Permit2 allowance transfer contract.
    IAllowanceTransfer constant PERMIT2 = IAllowanceTransfer(0x000000000022D473030F116dDEE9F6B43aC78BA3);

    /// @notice Canonical zero address sentinel.
    address constant ZERO_ADDRESS = address(0);
    /// @notice Native ETH sentinel address used across protocol logic.
    address constant ETH = address(0);
    /// @notice WETH token address.
    /// @custom:oz-upgrades-unsafe-allow state-variable-immutable
    address public immutable WETH_ADDRESS;

    /// @notice Default LP fee configured for protocol-created pools.
    uint24 constant DEFAULT_LP_FEE = 1_0000;
    /// @notice Default LP tick spacing configured for protocol-created pools.
    int24 constant DEFAULT_LP_TICK_SPACING = 200;

    /// @notice Basis points denominator.
    uint16 constant BPS_BASE = 100_00;
    /// @notice Decimal precision helper.
    uint256 constant PRECISION = 1 ether;
    /// @notice Max uint256 constant shortcut.
    uint256 constant MAX_UINT_256 = type(uint256).max;
    /// @notice Epoch length used by epoch-based accounting.
    uint256 constant EPOCH_LENGTH = 14 days;

    /*//////////////////////////////////////////////////////////////
                                ERRORS
    //////////////////////////////////////////////////////////////*/
    error Common__ZeroAddress();
    error Common__ZeroValue();
    error Common__EthTransferFailed();
    error Common__Unauthorized();
    error Common__Unsupported();

    constructor() {
        WETH_ADDRESS = _wethAddress(block.chainid);
    }

    /*//////////////////////////////////////////////////////////////
                            INTERNAL FUNCTIONS
    //////////////////////////////////////////////////////////////*/
    function _safeEthTransfer(address _receiver, uint256 _amount) internal {
        (bool success,) = payable(_receiver).call{value: _amount}("");
        if (!success) revert Common__EthTransferFailed();
    }

    function _balanceOf(address token) internal view returns (uint256) {
        return token == ETH ? address(this).balance : IERC20(token).balanceOf(address(this));
    }

    function _applyBps(uint256 amount, uint16 bps) internal pure returns (uint256) {
        return (amount * bps) / BPS_BASE;
    }

    function _nonZeroAddress(address _address) internal pure {
        if (_address == ZERO_ADDRESS) revert Common__ZeroAddress();
    }

    function _wethAddress(uint256 chainId) private pure returns (address) {
        if (chainId == 1) return 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2; // WETH mainnet
        if (chainId == 56) return 0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c; // WBNB BSC
        if (chainId == 31337) return 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2; // WETH mainnet fork
        if (chainId == 31338) return 0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c; // WBNB BSC fork
        if (chainId == 11155111) return 0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14; // WETH9 Sepolia testnet
        if (chainId == 97) return 0xae13d989daC2f0dEbFf460aC112a837C89BAa7cd; // WBNB BSC testnet
        if (chainId == 4663) return 0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73; // WETH9 Robinhood Chain
        if (chainId == 31339) return 0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73; // WETH9 Robinhood Chain fork
        if (chainId == 8453) return 0x4200000000000000000000000000000000000006; // WETH9 Base
        if (chainId == 31340) return 0x4200000000000000000000000000000000000006; // WETH9 Base fork
        revert Common__Unsupported(); // or a dedicated unsupported-chain error
    }
}
