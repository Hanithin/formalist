import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    // Le domaine se teste sans base ni serveur : c'est tout l'intérêt de l'isoler.
    include: ["tests/unite/**/*.test.ts", "tests/integration/**/*.test.ts"],
    environment: "node",
    /*
     * Un fichier à la fois.
     *
     * LibreOffice ne supporte pas d'être lancé plusieurs fois en parallèle - c'est
     * pourquoi pdf.cjs enchaîne les conversions une à une. Mais cette file vit dans
     * un processus, et vitest donne un processus par fichier de test : deux fichiers
     * qui convertissent en même temps relancent le problème, et l'un des deux échoue
     * sur un PDF que LibreOffice n'a pas écrit.
     */
    fileParallelism: false,
  },
  resolve: {
    alias: { "@": path.resolve(import.meta.dirname, "src") },
  },
});
