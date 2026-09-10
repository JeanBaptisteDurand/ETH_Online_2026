// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {AbonnementTARE} from "../src/AbonnementTARE.sol";

/**
 * LE CONTRAT D'ABONNEMENT.
 *
 * Trois choses peuvent y prendre de l'argent sans rien rendre, et ce sont les trois qui
 * portent le plus de tests :
 *
 *   1. le reste d'un paiement qui n'est pas un multiple du prix ;
 *   2. une remise a zero de l'echeance quand du temps paye reste ;
 *   3. un plafond qui tronquerait au lieu de refuser.
 *
 * Et le controle qui rend le reste utile : `abonneJusquA` doit rendre exactement 0 pour une
 * adresse jamais vue, parce que c'est ce zero-la que apps/api/src/compte/abonnement.ts
 * interprete comme « ne s'est jamais abonnee » — et qu'il distingue d'une lecture ratee.
 */
contract AbonnementTARETest is Test {
    AbonnementTARE a;

    uint256 constant PRIX = 0.001 ether;
    uint256 constant DUREE = 30 days;

    address proprio = address(0xA11CE);
    address moi = address(0xB0B);
    address autre = address(0xCA1);

    function setUp() public {
        vm.prank(proprio);
        a = new AbonnementTARE(PRIX, DUREE);
        vm.deal(moi, 100 ether);
        vm.deal(autre, 100 ether);
        // une heure non nulle : a timestamp 0, « echeance > block.timestamp » serait ambigu
        vm.warp(1_800_000_000);
    }

    /* ------------------------------------------------------------- le zero */

    function test_jamaisAbonneRendExactementZero() public view {
        assertEq(a.abonneJusquA(moi), 0);
        assertEq(a.abonneJusquA(address(0)), 0);
    }

    /* ------------------------------------------------- 1. le pro rata */

    function test_leprixExactDonneUnePeriodePleine() public {
        vm.prank(moi);
        a.abonner{value: PRIX}();
        assertEq(a.abonneJusquA(moi), block.timestamp + DUREE);
    }

    function test_uneFoisEtDemiLePrixDonneUneFoisEtDemiLaDuree() public {
        vm.prank(moi);
        a.abonner{value: (PRIX * 3) / 2}();
        // aucun reste garde : la duree suit le montant au wei
        assertEq(a.abonneJusquA(moi), block.timestamp + (DUREE * 3) / 2);
    }

    /**
     * LA GRANULARITE, dite explicitement plutot que decouverte plus tard.
     *
     * La duree est comptee en SECONDES entieres, donc la division tronque. Un wei de plus
     * n'achete rien : il faut `prix / duree` wei — ici 0,001 ether / 2 592 000 s, soit
     * environ 3,86 x 10^8 wei — pour acheter UNE seconde de plus.
     *
     * La perte maximale est donc d'une seconde d'abonnement, jamais d'une periode. C'est le
     * bon sens de l'arrondi : il ne peut pas donner plus que ce qui est paye. Un test qui
     * affirmerait « un wei de plus donne du temps de plus » serait faux, et je l'avais ecrit.
     */
    function test_laDivisionTronqueDUneSecondeAuPire() public {
        // le montant qui achete exactement DUREE + 1 secondes : arrondi PAR EXCES, parce
        // que `PRIX / DUREE` est lui-meme deja tronque et n'achete donc rien de plus.
        uint256 pourUneSecondeDePlus = ((DUREE + 1) * PRIX + DUREE - 1) / DUREE;
        assertGt(pourUneSecondeDePlus, PRIX);

        // un wei de plus : rien de plus, et c'est correct
        vm.prank(moi);
        a.abonner{value: PRIX + 1 wei}();
        assertEq(a.abonneJusquA(moi), block.timestamp + DUREE);

        // le prix d'une seconde de plus : une seconde de plus, exactement
        vm.prank(autre);
        a.abonner{value: pourUneSecondeDePlus}();
        assertEq(a.abonneJusquA(autre), block.timestamp + DUREE + 1);

        // et jamais plus que ce qui est paye
        assertLe(a.abonneJusquA(autre) - block.timestamp, (pourUneSecondeDePlus * DUREE) / PRIX);
    }

    function test_moinsQueLePrixEstRefuse() public {
        vm.prank(moi);
        vm.expectRevert(
            abi.encodeWithSelector(AbonnementTARE.MontantInsuffisant.selector, PRIX - 1, PRIX)
        );
        a.abonner{value: PRIX - 1}();
        assertEq(a.abonneJusquA(moi), 0);
    }

    function testFuzz_laDureeSuitToujoursLeMontant(uint96 montant) public {
        vm.assume(montant >= PRIX);
        vm.assume(uint256(montant) <= (uint256(a.DUREE_MAX()) * PRIX) / DUREE);
        vm.deal(moi, uint256(montant));
        vm.prank(moi);
        a.abonner{value: montant}();
        assertEq(a.abonneJusquA(moi), block.timestamp + (uint256(montant) * DUREE) / PRIX);
    }

    /* ---------------------------------------- 2. on prolonge, on ne remet pas a zero */

    function test_sereabonnerAvantEcheanceAJOUTE() public {
        vm.prank(moi);
        a.abonner{value: PRIX}();
        uint256 premiere = a.abonneJusquA(moi);

        // dix jours plus tard : il reste vingt jours payes
        vm.warp(block.timestamp + 10 days);
        vm.prank(moi);
        a.abonner{value: PRIX}();

        // les vingt jours restants ne sont PAS perdus
        assertEq(a.abonneJusquA(moi), premiere + DUREE);
        assertGt(a.abonneJusquA(moi), block.timestamp + DUREE);
    }

    function test_sereabonnerApresEcheanceRepartDeMaintenant() public {
        vm.prank(moi);
        a.abonner{value: PRIX}();
        // bien apres l'echeance : il n'y a rien a prolonger
        vm.warp(block.timestamp + 100 days);
        vm.prank(moi);
        a.abonner{value: PRIX}();
        assertEq(a.abonneJusquA(moi), block.timestamp + DUREE);
    }

    /* -------------------------------------- 3. le plafond refuse, il ne tronque pas */

    function test_auDelaDuPlafondLaTransactionRevertAvecLeMaximum() public {
        uint256 trop = (uint256(3651 days) * PRIX) / DUREE;
        vm.deal(moi, trop);
        vm.prank(moi);
        // le revert PORTE le montant maximum acceptable : l'appelant sait quoi renvoyer
        try a.abonner{value: trop}() {
            revert("le plafond aurait du refuser");
        } catch (bytes memory raison) {
            (uint256 demande, uint256 maxi) = _lirePlafond(raison);
            assertEq(demande, trop);
            assertLt(maxi, trop);
            // et ce maximum-la passe vraiment
            vm.deal(moi, maxi);
            vm.prank(moi);
            a.abonner{value: maxi}();
            assertLe(a.abonneJusquA(moi), block.timestamp + a.DUREE_MAX());
        }
    }

    function _lirePlafond(bytes memory raison) private pure returns (uint256, uint256) {
        bytes4 sel;
        assembly {
            sel := mload(add(raison, 0x20))
        }
        require(sel == AbonnementTARE.AuDelaDuPlafond.selector, "mauvais revert");
        uint256 x;
        uint256 y;
        assembly {
            x := mload(add(raison, 0x24))
            y := mload(add(raison, 0x44))
        }
        return (x, y);
    }

    /* ------------------------------------------------- abonner pour un autre */

    function test_abonnerPourCrediteLeCompteEtPasLePayeur() public {
        vm.prank(moi);
        a.abonnerPour{value: PRIX}(autre);
        assertEq(a.abonneJusquA(autre), block.timestamp + DUREE);
        assertEq(a.abonneJusquA(moi), 0);
    }

    function test_abonnerPourLAdresseNulleEstRefuse() public {
        vm.prank(moi);
        vm.expectRevert(AbonnementTARE.AdresseNulle.selector);
        a.abonnerPour{value: PRIX}(address(0));
    }

    function test_unVirementNuAbonneLexpediteur() public {
        vm.prank(moi);
        (bool ok, ) = address(a).call{value: PRIX}("");
        assertTrue(ok);
        assertEq(a.abonneJusquA(moi), block.timestamp + DUREE);
    }

    /* ----------------------------------------------------- administration */

    function test_seulLeProprietairChangeLePrix() public {
        vm.prank(moi);
        vm.expectRevert(abi.encodeWithSelector(AbonnementTARE.PasProprietaire.selector, moi));
        a.changerPrix(1, 1);

        vm.prank(proprio);
        a.changerPrix(2 * PRIX, DUREE);
        assertEq(a.prix(), 2 * PRIX);
        // et le nouveau prix s'applique tout de suite
        vm.prank(moi);
        a.abonner{value: 2 * PRIX}();
        assertEq(a.abonneJusquA(moi), block.timestamp + DUREE);
    }

    function test_unPrixOuUneDureeNulsSontRefuses() public {
        vm.startPrank(proprio);
        vm.expectRevert(AbonnementTARE.PrixNul.selector);
        a.changerPrix(0, DUREE);
        vm.expectRevert(AbonnementTARE.DureeNulle.selector);
        a.changerPrix(PRIX, 0);
        vm.stopPrank();
    }

    function test_retirerRendTOUTLeSoldeEtSeulementAuProprietaire() public {
        vm.prank(moi);
        a.abonner{value: 3 * PRIX}();
        assertEq(address(a).balance, 3 * PRIX);

        vm.prank(moi);
        vm.expectRevert(abi.encodeWithSelector(AbonnementTARE.PasProprietaire.selector, moi));
        a.retirer(payable(moi));

        address payable caisse = payable(address(0xDEAD));
        vm.prank(proprio);
        a.retirer(caisse);
        assertEq(caisse.balance, 3 * PRIX);
        assertEq(address(a).balance, 0);

        // un second retrait sur un solde vide refuse, au lieu de reussir sans rien faire
        vm.prank(proprio);
        vm.expectRevert(AbonnementTARE.RienARetirer.selector);
        a.retirer(caisse);
    }

    function test_retirerNeTOUCHEPasLesEcheances() public {
        vm.prank(moi);
        a.abonner{value: PRIX}();
        uint256 avant = a.abonneJusquA(moi);
        vm.prank(proprio);
        a.retirer(payable(address(0xDEAD)));
        // retirer les fonds ne desabonne personne : ce serait vendre puis reprendre
        assertEq(a.abonneJusquA(moi), avant);
    }

    function test_changerProprietaire() public {
        vm.prank(proprio);
        a.changerProprietaire(moi);
        assertEq(a.proprietaire(), moi);
        vm.prank(proprio);
        vm.expectRevert(abi.encodeWithSelector(AbonnementTARE.PasProprietaire.selector, proprio));
        a.changerPrix(1, 1);
    }

    /* ------------------------------------------------------------- l'ecran */

    function test_coutPourEstLinverseExactDuProRata() public view {
        assertEq(a.coutPour(DUREE), PRIX);
        assertEq(a.coutPour(DUREE / 2), PRIX / 2);
        assertEq(a.coutPour(365 days), (365 days * PRIX) / DUREE);
    }

    /* ----------------------------------------------- ce que l'API lira vraiment */

    function test_leSelecteurEstCeluiQuAttendLAPI() public pure {
        // apps/api/src/compte/abonnement.ts calcule keccak("abonneJusquA(address)")[0..4].
        // Si la signature change ici, la lecture cote serveur rend `0x` sans le dire.
        assertEq(
            bytes4(keccak256("abonneJusquA(address)")),
            AbonnementTARE.abonneJusquA.selector
        );
    }

    function test_leJournalPorteLePayeurEtLeCompte() public {
        vm.expectEmit(true, true, false, true, address(a));
        emit AbonnementTARE.Abonne(autre, moi, PRIX, block.timestamp + DUREE);
        vm.prank(moi);
        a.abonnerPour{value: PRIX}(autre);
    }
}
