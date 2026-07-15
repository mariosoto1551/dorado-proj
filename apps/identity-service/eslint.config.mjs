import baseConfig from "../../eslint.config.mjs";

export default [
    {
        // Cliente Prisma generado — no se lintea código generado.
        ignores: ["src/generated"],
    },
    ...baseConfig
];
