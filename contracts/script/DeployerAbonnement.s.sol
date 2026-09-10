// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.24;

import {Script} from "forge-std/Script.sol";
import {console} from "forge-std/console.sol";
import {AbonnementTARE} from "../src/AbonnementTARE.sol";

/**
 * DEPLOIEMENT DU CONTRAT D'ABONNEMENT, sur Base Sepolia (chaine 84532).
 *
 *   export DEPLOYEUR_CLE=0x…                # la cle privee du deployeur
 *   export TARE_ABONNEMENT_RPC=https://sepolia.base.org
 *   forge script script/DeployerAbonnement.s.sol \
 *     --rpc-url $TARE_ABONNEMENT_RPC --broadcast -vvv
 *
 * Prealable : le compte du deployeur doit detenir de l'ETH de test Base Sepolia. Sans lui,
 * `forge` echoue au calcul du gaz et le message ne dit pas que c'est ca — d'ou la
 * verification explicite au debut de ce script, qui refuse en le nommant.
 *
 * A la fin, il imprime les DEUX variables a poser dans l'environnement de l'API. Tant
 * qu'elles sont absentes, apps/api/src/compte/abonnement.ts rend `configDepuisEnv() == null`
 * et le compte repond « abonnement non verifie, donc pas actif » — un refus motive, pas une
 * panne, mais un refus quand meme.
 *
 * PRIX PAR DEFAUT : 0,001 ETH pour 30 jours. C'est un prix de RESEAU DE TEST, choisi pour
 * qu'un faucet suffise a s'abonner plusieurs fois ; il ne dit rien du prix reel du service.
 */
contract DeployerAbonnement is Script {
    uint256 constant PRIX_DEFAUT = 0.001 ether;
    uint256 constant DUREE_DEFAUT = 30 days;

    function run() external {
        uint256 cle = vm.envUint("DEPLOYEUR_CLE");
        address deployeur = vm.addr(cle);
        uint256 prix = vm.envOr("TARE_ABONNEMENT_PRIX", PRIX_DEFAUT);
        uint256 duree = vm.envOr("TARE_ABONNEMENT_DUREE", DUREE_DEFAUT);

        console.log("chaine        ", block.chainid);
        console.log("deployeur     ", deployeur);
        console.log("solde (wei)   ", deployeur.balance);

        // Le refus nomme sa cause. « Insufficient funds for gas » ne dit pas OU chercher.
        require(
            deployeur.balance > 0,
            "le deployeur n'a pas d'ETH de test : alimente-le sur un faucet Base Sepolia avant de rejouer"
        );

        vm.startBroadcast(cle);
        AbonnementTARE a = new AbonnementTARE(prix, duree);
        vm.stopBroadcast();

        console.log("");
        console.log("=== deploye ===");
        console.log("adresse       ", address(a));
        console.log("prix (wei)    ", a.prix());
        console.log("duree (s)     ", a.duree());
        console.log("proprietaire  ", a.proprietaire());
        console.log("");
        console.log("A poser dans l'environnement de l'API :");
        console.log("  TARE_ABONNEMENT_CONTRAT=", address(a));
        console.log("  TARE_ABONNEMENT_CHAIN_ID=", block.chainid);
        console.log("  TARE_ABONNEMENT_RPC=<le meme noeud que celui de ce deploiement>");
        console.log("");
        console.log("Verification, depuis n'importe ou :");
        console.log("  cast call <contrat> 'abonneJusquA(address)(uint256)' <adresse> --rpc-url <rpc>");
        console.log("  -> 0 signifie 'jamais abonnee', et c'est la seule fois du projet ou un zero est une reponse");
    }
}
