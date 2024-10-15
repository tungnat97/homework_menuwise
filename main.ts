import { GetProductsForIngredient, GetRecipes, NutrientBaseUoM } from "./supporting-files/data-access";
import { ConvertUnits, GetNutrientFactInBaseUnits } from "./supporting-files/helpers";
import { NutrientFact, Product, Recipe, RecipeLineItem, UnitOfMeasure, UoMName, UoMType } from "./supporting-files/models";
import { ExpectedRecipeSummary, RunTest } from "./supporting-files/testing";

console.clear();
console.log("Expected Result Is:", ExpectedRecipeSummary);

const recipeData = GetRecipes(); // the list of 1 recipe you should calculate the information for
console.log("Recipe Data:", recipeData);
const recipeSummary: any = {}; // the final result to pass into the test function
/*
 * YOUR CODE GOES BELOW THIS, DO NOT MODIFY ABOVE
 * (You can add more imports if needed)
 * */


// This indicates the chosen product, the supplier product's index, and the necessary cost
// for the supplier product to cover the respective item, 
type Result = {
    product: Product;
    supplierIndex: number;
    cost: number;
}

// Temporary conversion from cups to kilogram
// Need optimizations to get the conversion straight from a graph or something
function handleConvert(
    fromUoM: UnitOfMeasure,
    toUoMName: UoMName,
    toUoMType: UoMType
) {
    if (fromUoM.uomName === UoMName.cups && toUoMName === UoMName.kilogram && toUoMType === UoMType.mass) {
        return ConvertUnits(
            ConvertUnits(
                ConvertUnits(fromUoM, UoMName.millilitres, UoMType.volume),
                UoMName.grams, UoMType.mass
            ),
            toUoMName,
            toUoMType
        );
    }
    if (fromUoM.uomName === UoMName.cups && toUoMName === UoMName.grams && toUoMType === UoMType.mass) {
        return ConvertUnits(
            ConvertUnits(fromUoM, UoMName.millilitres, UoMType.volume),
            UoMName.grams, UoMType.mass
        );
    }
    return ConvertUnits(fromUoM, toUoMName, toUoMType);
}

function calculateBestCandidate(candidate: Product, item: RecipeLineItem) {

    let record;
    let supplierIndex;
    // Iterate through the supplier products to find the cheapest one (cheapest cost per unit of measure)
    for (let i = 0; i < candidate.supplierProducts.length; ++i) {
        try {
            const supplier = candidate.supplierProducts[i];
            const convertedUnit = handleConvert(item.unitOfMeasure, supplier.supplierProductUoM.uomName, supplier.supplierProductUoM.uomType);
            const currentCheapest = convertedUnit.uomAmount / supplier.supplierProductUoM.uomAmount * supplier.supplierPrice;
            if (record === undefined || (currentCheapest < record)) {
                record = currentCheapest;
                supplierIndex = i
            }
        } catch (err) {
            continue;
        }
    }
    return { record, supplierIndex }
}

function getCheapestProductFromItem(item: RecipeLineItem) {
    const candidates = GetProductsForIngredient(item.ingredient);
    let cheapestCost = 1e9; // cheapest cost
    let bestCandidate;
    let supplierIndex = -1;
    for (const candidate of candidates) {
        // return the best possible candidate
        const { record: possibleRecord, supplierIndex: possibleSupplierIndex } = calculateBestCandidate(candidate, item);
        if (possibleRecord !== undefined && possibleSupplierIndex !== undefined && possibleRecord < cheapestCost) {
            bestCandidate = candidate;
            cheapestCost = possibleRecord;
            supplierIndex = possibleSupplierIndex
        }
    }
    return { bestCandidate, cheapestCost, supplierIndex }
}

function calculateSummary(recipe: Recipe, configuration: Result[]) {
    // Get map of nutrients to base by name
    const mapNutrientsByName = configuration.reduce((map: Record<string, NutrientFact[]>, r) => {
        for (const nutrients of r.product.nutrientFacts) {
            const key = nutrients.nutrientName;
            map[key] = map[key] || [];
            map[key].push(GetNutrientFactInBaseUnits(nutrients));
        }
        return map;
    }, {});

    // Get cheapest cost
    const cheapestCost = configuration.reduce((sum, r) => sum += r.cost, 0);

    /**
     * Calculate the total amount per unit of measurement for each nutrient
     * It should be the total amount of that nutrient divide by the total amount of the configuration multiply by the base amount (100 grams)
     */
    const nutrientsAtCheapestCost: Record<string, NutrientFact> = {}
    for (const key in mapNutrientsByName) {
        const sum = mapNutrientsByName[key].reduce((s, e) => s += e.quantityAmount.uomAmount, 0);
        nutrientsAtCheapestCost[key] = {
            nutrientName: key,
            quantityAmount: {
                uomAmount: sum,
                uomName: NutrientBaseUoM.uomName,
                uomType: NutrientBaseUoM.uomType
            },
            quantityPer: NutrientBaseUoM,
        }
    }
    Object.assign(recipeSummary, {
        [recipe.recipeName]: {
            cheapestCost,
            nutrientsAtCheapestCost: Object.keys(nutrientsAtCheapestCost).sort().reduce((map, k) => Object.assign(map, {[k]: nutrientsAtCheapestCost[k]}), {})
        }
    })
}

function getCheapestCost(recipe: Recipe) {
    const configuration: Result[] = []
    for (const item of recipe.lineItems) {
        // for each item, find the cheapest result.
        const resultOfItem = getCheapestProductFromItem(item);
        if (!resultOfItem.bestCandidate) {
            throw new Error(`Could not find any result for this item! ${item.ingredient.ingredientName}`)
        }
        configuration.push({
            product: resultOfItem.bestCandidate,
            supplierIndex: resultOfItem.supplierIndex,
            cost: resultOfItem.cheapestCost,
        })
    }
    calculateSummary(recipe, configuration)
}


// Solve
for (const recipe of recipeData) {
    getCheapestCost(recipe);
}

/*
 * YOUR CODE ABOVE THIS, DO NOT MODIFY BELOW
 * */
RunTest(recipeSummary);

