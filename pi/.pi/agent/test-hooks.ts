// Shared test bootstrap: teach plain node what pi's jiti loader already does,
// so `node test-*.ts` resolves the import styles the extensions use:
//   "./x.js"        -> ./x.ts        (TS source imported with .js)
//   "./status-line" -> ./status-line/index.ts   (extensionless directory)
//   "./capped"      -> ./capped.ts   (extensionless file)
// Bun and jiti handle this natively; the hook is a no-op there.
import { registerHooks } from "node:module";

if (typeof registerHooks === "function") {
	registerHooks({
		resolve(spec, ctx, next) {
			try {
				return next(spec, ctx);
			} catch (err) {
				if (!spec.startsWith(".") && !spec.startsWith("/")) throw err;
				const candidates = spec.endsWith(".js")
					? [`${spec.slice(0, -3)}.ts`]
					: [`${spec}.ts`, `${spec}/index.ts`];
				for (const candidate of candidates) {
					try {
						return next(candidate, ctx);
					} catch {
						// try the next candidate
					}
				}
				throw err;
			}
		},
	});
}
