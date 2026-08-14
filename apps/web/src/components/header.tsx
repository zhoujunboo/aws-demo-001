import { ModeToggle } from "./mode-toggle";

export default function Header() {
	return (
		<header className="flex h-12 items-center justify-between border-b px-4 md:px-6">
			<div className="flex items-center gap-2 font-semibold text-sm">
				<span className="size-2 bg-emerald-500" />
				AWS Demo 001
			</div>
			<ModeToggle />
		</header>
	);
}
