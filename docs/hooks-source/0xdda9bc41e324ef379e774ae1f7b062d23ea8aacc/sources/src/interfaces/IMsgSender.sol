// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

/// @notice Exposes the initiating wallet held by a configured Creator Buy router during execution.
interface IMsgSender {
    function msgSender() external view returns (address sender);
}
