
import { describe, expect, it } from "vitest";
import { Cl } from "@stacks/transactions";

const accounts = simnet.getAccounts();
const deployer = accounts.get("deployer")!;
const wallet1 = accounts.get("wallet_1")!;
const wallet2 = accounts.get("wallet_2")!;

describe("Apexfactor Contract Tests", () => {

    describe("Utility Counter", () => {
        it("starts at 0", () => {
            const { result } = simnet.callReadOnlyFn("apexfactor", "get-counter-value", [], deployer);
            expect(result).toBeUint(0);
        });

        it("increments the counter", () => {
            const { result } = simnet.callPublicFn("apexfactor", "count-up", [], deployer);
            expect(result).toBeOk(Cl.uint(1));

            const read = simnet.callReadOnlyFn("apexfactor", "get-counter-value", [], deployer);
            expect(read.result).toBeUint(1);
        });

        it("decrements the counter", () => {
            simnet.callPublicFn("apexfactor", "count-up", [], deployer);
            const { result } = simnet.callPublicFn("apexfactor", "count-down", [], deployer);
            expect(result).toBeOk(Cl.uint(0));
        });
    });

    describe("Invoice Lifecycle", () => {
        const amount = 1000;
        const dueDate = 100;
        const customer = "Acme Corp";

        it("allows creating an invoice", () => {
            const { result } = simnet.callPublicFn(
                "apexfactor",
                "create-invoice",
                [Cl.uint(amount), Cl.uint(dueDate), Cl.stringAscii(customer)],
                wallet1
            );
            expect(result).toBeOk(Cl.uint(1));
        });

        it("allows retrieval of invoice details", () => {
            // Setup
            simnet.callPublicFn(
                "apexfactor",
                "create-invoice",
                [Cl.uint(amount), Cl.uint(dueDate), Cl.stringAscii(customer)],
                wallet1
            );

            const { result } = simnet.callReadOnlyFn("apexfactor", "get-invoice", [Cl.uint(1)], wallet1);
            expect(result).toBeSome(
                Cl.tuple({
                    amount: Cl.uint(amount),
                    status: Cl.stringAscii("OPEN"),
                    seller: Cl.standardPrincipal(wallet1),
                    customer: Cl.stringAscii(customer),
                    "due-date": Cl.uint(dueDate),
                    buyer: Cl.none()
                })
            );
        });

        it("allows purchasing an invoice", () => {
            // Setup
            simnet.callPublicFn("apexfactor", "create-invoice", [Cl.uint(amount), Cl.uint(dueDate), Cl.stringAscii(customer)], wallet1);

            const { result } = simnet.callPublicFn(
                "apexfactor",
                "purchase-invoice",
                [Cl.uint(1)],
                wallet2
            );
            expect(result).toBeOk(Cl.bool(true));

            const invoice = simnet.callReadOnlyFn("apexfactor", "get-invoice", [Cl.uint(1)], wallet1).result;
            expect(invoice).toBeSome(
                Cl.tuple({
                    amount: Cl.uint(amount),
                    status: Cl.stringAscii("FUNDED"),
                    seller: Cl.standardPrincipal(wallet1),
                    customer: Cl.stringAscii(customer),
                    "due-date": Cl.uint(dueDate),
                    buyer: Cl.some(Cl.standardPrincipal(wallet2))
                })
            );
        });

        it("prevents purchasing an already funded invoice", () => {
            // Setup
            simnet.callPublicFn("apexfactor", "create-invoice", [Cl.uint(amount), Cl.uint(dueDate), Cl.stringAscii(customer)], wallet1);
            simnet.callPublicFn("apexfactor", "purchase-invoice", [Cl.uint(1)], wallet2);

            const { result } = simnet.callPublicFn(
                "apexfactor",
                "purchase-invoice",
                [Cl.uint(1)],
                deployer
            );
            expect(result).toBeErr(Cl.uint(104)); // ERR-INVALID-STATE
        });

        it("allows paying an invoice", () => {
            // Setup
            simnet.callPublicFn("apexfactor", "create-invoice", [Cl.uint(amount), Cl.uint(dueDate), Cl.stringAscii(customer)], wallet1);
            simnet.callPublicFn("apexfactor", "purchase-invoice", [Cl.uint(1)], wallet2);

            const { result } = simnet.callPublicFn(
                "apexfactor",
                "pay-invoice",
                [Cl.uint(1)],
                wallet1
            );
            expect(result).toBeOk(Cl.bool(true));

            const invoice = simnet.callReadOnlyFn("apexfactor", "get-invoice", [Cl.uint(1)], wallet1).result;
            expect(invoice).toBeSome(
                Cl.tuple({
                    amount: Cl.uint(amount),
                    status: Cl.stringAscii("PAID"),
                    seller: Cl.standardPrincipal(wallet1),
                    customer: Cl.stringAscii(customer),
                    "due-date": Cl.uint(dueDate),
                    buyer: Cl.some(Cl.standardPrincipal(wallet2))
                })
            );
        });

        it("allows disputing an invoice", () => {
            // Setup
            simnet.callPublicFn("apexfactor", "create-invoice", [Cl.uint(500), Cl.uint(200), Cl.stringAscii("Bad Corp")], wallet1);

            const { result } = simnet.callPublicFn("apexfactor", "dispute-invoice", [Cl.uint(1)], wallet1);
            expect(result).toBeOk(Cl.bool(true));

            const invoice = simnet.callReadOnlyFn("apexfactor", "get-invoice", [Cl.uint(1)], wallet1).result;
            expect(invoice).toBeSome(
                Cl.tuple({
                    amount: Cl.uint(500),
                    status: Cl.stringAscii("DISPUTED"),
                    seller: Cl.standardPrincipal(wallet1),
                    customer: Cl.stringAscii("Bad Corp"),
                    "due-date": Cl.uint(200),
                    buyer: Cl.none()
                })
            );
        });

        it("prevents unauthorized dispute", () => {
            // Setup
            simnet.callPublicFn("apexfactor", "create-invoice", [Cl.uint(500), Cl.uint(200), Cl.stringAscii("Another Corp")], wallet1);

            const { result } = simnet.callPublicFn("apexfactor", "dispute-invoice", [Cl.uint(1)], deployer);
            expect(result).toBeErr(Cl.uint(100)); // ERR-NOT-AUTHORIZED
        });
    });
});
