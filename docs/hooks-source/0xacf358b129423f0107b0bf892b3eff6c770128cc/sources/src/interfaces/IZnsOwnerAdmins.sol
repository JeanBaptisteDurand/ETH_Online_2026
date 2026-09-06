// SPDX-License-Identifier: MIT
// Forked from Clanker v4 (clanker-devco/v4-contracts @ b004c2e, MIT) — src/interfaces/IOwnerAdmins.sol
// ZNS Launchpad. Renamed; behavior unchanged.
pragma solidity ^0.8.26;

interface IZnsOwnerAdmins {
    error Unauthorized();

    event SetAdmin(address indexed admin, bool enabled);

    function setAdmin(address admin, bool isAdmin) external;
}
