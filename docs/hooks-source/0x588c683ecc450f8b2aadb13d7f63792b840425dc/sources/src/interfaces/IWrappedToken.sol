// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/**
 * Generalises the flETH deposit / withdraw wrapper interface to any wrapped paired token.
 *
 * For a native-ETH wrapper (flETH) `deposit` is payable and wraps `msg.value`, and `withdraw`
 * returns native ETH to the caller. For an ERC20-backed wrapper (flUSDC) `deposit` pulls the
 * `underlying` ERC20 from the caller and `withdraw` returns that underlying ERC20 to the caller.
 *
 * @dev This supersedes the flETH-specific {IFLETH} interface, which is retained as a flETH alias
 * for native-wrapper specific deploy math.
 */
interface IWrappedToken {
    /**
     * Wraps tokens into the wrapped representation.
     *
     * @param _amount The amount of `underlying` to wrap (ignored by native wrappers, which use
     * `msg.value`)
     */
    function deposit(
        uint _amount
    ) external payable;

    /**
     * Unwraps `_amount` of the wrapped token, returning either native ETH (native wrappers) or
     * the `underlying` ERC20 (ERC20 wrappers) to the caller.
     *
     * @param _amount The amount of the wrapped token to unwrap
     */
    function withdraw(
        uint _amount
    ) external;

    /**
     * The ERC20 token unwrapped from this wrapper, or `address(0)` for a native-ETH wrapper.
     *
     * @return The address of the underlying token
     */
    function underlying() external view returns (address);
}
