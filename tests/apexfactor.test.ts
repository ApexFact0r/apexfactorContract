
import { describe, expect, it } from "vitest";

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
            expect(result).toBeOk(expect.toBeUint(1));

            const read = simnet.callReadOnlyFn("apexfactor", "get-counter-value", [], deployer);
            expect(read.result).toBeUint(1);
        });

        it("decrements the counter", () => {
            // Reset or just continue from previous state (simnet resets per test file usually unless configured otherwise, but let's assume isolated if we could, but 'it' blocks run sequentially in verify usually. Simnet state is persisted across 'it' blocks within a 'describe' usually? Actually standard vitest/framework behavior combined with clarinet wrapper. Usually it preserves state. Let's assume preservation and setup accordingly or chaining.)
            // Actually, creating a fresh block effectively or we can just count up then down.

            simnet.callPublicFn("apexfactor", "count-up", [], deployer); // Ensure it's at least 1 (or 2 if previous ran)
            const valAfterUp = simnet.callReadOnlyFn("apexfactor", "get-counter-value", [], deployer).result;
            const val = Number((valAfterUp as any).value);

            const { result } = simnet.callPublicFn("apexfactor", "count-down", [], deployer);
            expect(result).toBeOk(expect.toBeUint(val - 1));
        });
    });

    describe("Invoice Lifecycle", () => {
        const amount = 1000;
        const dueDate = 100; // block height or undefined unit
        const customer = "Acme Corp";

        it("allows creating an invoice", () => {
            const { result } = simnet.callPublicFn(
                "apexfactor",
                "create-invoice",
                [simnet.uint(amount), simnet.uint(dueDate), simnet.stringAscii(customer)],
                wallet1
            );
            expect(result).toBeOk(expect.toBeUint(1)); // First invoice ID should be 1
        });

        it("allows retrieval of invoice details", () => {
            const { result } = simnet.callReadOnlyFn("apexfactor", "get-invoice", [simnet.uint(1)], wallet1);
            expect(result).toBeSome(expect.objectContaining({
                amount: expect.toBeUint(amount),
                status: expect.toBeStringAscii("OPEN"),
                seller: expect.toBePrincipal(wallet1),
                customer: expect.toBeStringAscii(customer)
            }));
        });

        it("allows purchasing an invoice", () => {
            // wallet2 purchases invoice 1
            const { result } = simnet.callPublicFn(
                "apexfactor",
                "purchase-invoice",
                [simnet.uint(1)],
                wallet2
            );
            expect(result).toBeOk(expect.toBeTrue());

            // Check status updated
            const invoice = simnet.callReadOnlyFn("apexfactor", "get-invoice", [simnet.uint(1)], wallet1).result;
            expect(invoice).toBeSome(expect.objectContaining({
                status: expect.toBeStringAscii("FUNDED"),
                buyer: expect.toBeSome(expect.toBePrincipal(wallet2))
            }));
        });

        it("prevents purchasing an already funded invoice", () => {
            const { result } = simnet.callPublicFn(
                "apexfactor",
                "purchase-invoice",
                [simnet.uint(1)],
                deployer
            );
            expect(result).toBeErr(expect.toBeUint(104)); // ERR-INVALID-STATE
        });

        it("allows paying an invoice", () => {
            // Customer (anyone really in this simple model, but simulated as transaction sender) pays back
            // The contract logic says 'pay-invoice' transfers from tx-sender to buyer.
            // In reality, 'pay-invoice' might be called by the seller forwarding funds or the customer directly if they use the platform.
            // Let's assume verified customer access or just open payment for now as implemented.

            const { result } = simnet.callPublicFn(
                "apexfactor",
                "pay-invoice",
                [simnet.uint(1)],
                wallet1 // Seller/Customer pays
            );
            expect(result).toBeOk(expect.toBeTrue());

            const invoice = simnet.callReadOnlyFn("apexfactor", "get-invoice", [simnet.uint(1)], wallet1).result;
            expect(invoice).toBeSome(expect.objectContaining({
                status: expect.toBeStringAscii("PAID")
            }));
        });

        it("allows disputing an invoice", () => {
            // Create a new invoice for dispute test
            simnet.callPublicFn("apexfactor", "create-invoice", [simnet.uint(500), simnet.uint(200), simnet.stringAscii("Bad Corp")], wallet1);
            const invoiceId = 2;

            const { result } = simnet.callPublicFn("apexfactor", "dispute-invoice", [simnet.uint(invoiceId)], wallet1);
            expect(result).toBeOk(expect.toBeTrue());

            const invoice = simnet.callReadOnlyFn("apexfactor", "get-invoice", [simnet.uint(invoiceId)], wallet1).result;
            expect(invoice).toBeSome(expect.objectContaining({
                status: expect.toBeStringAscii("DISPUTED")
            }));
        });

        it("prevents unauthorized dispute", () => {
            // Create a new invoice
            simnet.callPublicFn("apexfactor", "create-invoice", [simnet.uint(500), simnet.uint(200), simnet.stringAscii("Another Corp")], wallet1);
            const invoiceId = 3;

            // Random user tries to dispute
            const { result } = simnet.callPublicFn("apexfactor", "dispute-invoice", [simnet.uint(invoiceId)], deployer);
            expect(result).toBeErr(expect.toBeUint(100)); // ERR-NOT-AUTHORIZED
        });
    });
});
