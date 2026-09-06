// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {HookRateAttestations} from "../src/HookRateAttestations.sol";

/**
 * Ce que le contrat REFUSE compte plus que ce qu'il accepte.
 *
 * Le projet entier tient sur une regle : une lecture qui n'a pas eu lieu n'est jamais un zero.
 * Un contrat qui accepterait `nMeasured = 0` publierait un hook jamais mesure avec un
 * confortable 0 bps, et un routeur le lirait comme « celui-ci ne prend rien ». C'est
 * exactement le mensonge que TARE existe pour rendre impossible, grave dans l'etat d'une
 * chaine ou personne ne pourrait plus le corriger.
 */
contract HookRateAttestationsTest is Test {
    HookRateAttestations a;

    address constant HOOK = 0x0469a4Bd3724DC86C9542F4694c976DA13C450c0;
    bytes32 constant DIGEST = keccak256("corpus");
    bytes32 constant STUB = 0x8e39b2ad4344342b4f7dc5cf31df0aec9bd5b5f8ec7fccd241256cf1fda637a4;

    function setUp() public {
        a = new HookRateAttestations();
    }

    function _ok() internal {
        a.attest(HOOK, 8453, 50_614_000, 999_942, 1_000_000, 8, 3, 2, DIGEST, STUB, "tare-engine/0.3.0");
    }

    /* ------------------------------------------------------------------ refus */

    function test_RefuseUnHookSansAucuneMesure() public {
        vm.expectRevert(abi.encodeWithSelector(HookRateAttestations.NoMeasurement.selector, HOOK));
        a.attest(HOOK, 8453, 50_614_000, 0, 0, 0, 16, 2, DIGEST, STUB, "tare-engine/0.3.0");
    }

    function test_RefuseUneFigureSansCorpus() public {
        vm.expectRevert(abi.encodeWithSelector(HookRateAttestations.NoCorpusDigest.selector, HOOK));
        a.attest(HOOK, 8453, 50_614_000, 999_942, 1_000_000, 8, 0, 2, bytes32(0), STUB, "v");
    }

    function test_RefuseUneFigureSansMethode() public {
        vm.expectRevert(abi.encodeWithSelector(HookRateAttestations.NoStubHash.selector, HOOK));
        a.attest(HOOK, 8453, 50_614_000, 999_942, 1_000_000, 8, 0, 2, DIGEST, bytes32(0), "v");
    }

    function test_RefuseUneMedianeAuDessusDuMaximum() public {
        vm.expectRevert(
            abi.encodeWithSelector(HookRateAttestations.MedianAboveMax.selector, uint64(2), uint64(1))
        );
        a.attest(HOOK, 8453, 50_614_000, 2, 1, 8, 0, 2, DIGEST, STUB, "v");
    }

    function test_LireUnHookJamaisAttesteReverte_JamaisUnStructDeZeros() public {
        // Un appelant qui recevrait une structure remplie de zeros ne pourrait pas distinguer
        // « mesure a zero » de « jamais mesure ». On revert plutot que de laisser ce doute.
        vm.expectRevert(
            abi.encodeWithSelector(HookRateAttestations.NothingAttested.selector, HOOK, address(this))
        );
        a.latest(HOOK, address(this));
        assertFalse(a.hasAttestation(HOOK, address(this)));
    }

    /* --------------------------------------------------------------- acceptation */

    function test_EnregistreEtRelitAuBpsPres() public {
        _ok();
        HookRateAttestations.Attestation memory r = a.latest(HOOK, address(this));
        assertEq(r.hook, HOOK);
        assertEq(r.measuredChainId, 8453);
        assertEq(r.blockNumber, 50_614_000);
        // 999942 / 10000 = 99.9942 bps — les quatre decimales du moteur survivent au stockage.
        assertEq(r.medianBpsScaled, 999_942);
        assertEq(r.maxBpsScaled, 1_000_000);
        assertEq(r.nMeasured, 8);
        assertEq(r.nUnmeasurable, 3);
        assertEq(r.corpusDigest, DIGEST);
        assertEq(r.stubHash, STUB);
        assertEq(r.attester, address(this));
        assertEq(r.engineVersion, "tare-engine/0.3.0");
    }

    function test_DeuxAttesteursNeSEcrasentPas() public {
        _ok();
        address autre = address(0xBEEF);
        vm.prank(autre);
        a.attest(HOOK, 8453, 50_614_000, 500_000, 600_000, 4, 0, 1, DIGEST, STUB, "autre/1.0");

        assertEq(a.latest(HOOK, address(this)).medianBpsScaled, 999_942);
        assertEq(a.latest(HOOK, autre).medianBpsScaled, 500_000);
        address[] memory who = a.attestersOf(HOOK);
        assertEq(who.length, 2);
        assertEq(who[0], address(this));
        assertEq(who[1], autre);
    }

    function test_UneRevision_LaisseLAncienneDansLeJournal() public {
        _ok();
        vm.recordLogs();
        a.attest(HOOK, 8453, 50_614_001, 1_100_000, 1_200_000, 9, 0, 2, DIGEST, STUB, "tare-engine/0.3.1");
        // La valeur courante bouge, mais l'evenement de la premiere reste dans la chaine :
        // rien n'est revise en silence.
        assertEq(a.latest(HOOK, address(this)).medianBpsScaled, 1_100_000);
        assertEq(vm.getRecordedLogs().length, 1);
        assertEq(a.attestersOf(HOOK).length, 1, "une revision ne cree pas un second attesteur");
    }

    function test_LeCatalogueNeCompteChaqueHookQuUneFois() public {
        _ok();
        _ok();
        a.attest(address(0xCAFE), 8453, 50_614_000, 1, 1, 1, 0, 1, DIGEST, STUB, "v");
        assertEq(a.hookCount(), 2);
        assertEq(a.hooks()[0], HOOK);
    }

    function test_UnHookNonMesurableResteABSENT() public {
        // Le cas qui compte : 16 lignes tentees, aucune aboutie. Le contrat ne doit PAS
        // pouvoir porter ce hook, sous aucune forme.
        vm.expectRevert(abi.encodeWithSelector(HookRateAttestations.NoMeasurement.selector, HOOK));
        a.attest(HOOK, 8453, 50_614_000, 0, 0, 0, 16, 2, DIGEST, STUB, "v");
        assertEq(a.hookCount(), 0);
        assertFalse(a.hasAttestation(HOOK, address(this)));
    }
}
