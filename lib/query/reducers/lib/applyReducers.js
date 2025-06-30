export default async function applyReducers(root, params) {
    _.each(root.collectionNodes, node => {
        applyReducers(node, params);
    });

    const processedReducers = [];
    let reducersQueue = [...root.reducerNodes];

    // TODO: find out if there's an infinite reducer inter-deendency

    while (reducersQueue.length) {
        const reducerNode = reducersQueue.shift();

        // If this reducer depends on other reducers
        if (reducerNode.dependencies.length) {
            // If there is an unprocessed reducer, move it at the end of the queue
            const allDependenciesComputed = _.all(reducerNode.dependencies, dep => processedReducers.includes(dep));
            if (allDependenciesComputed) {
                for (const result of root.results) {
                    await reducerNode.compute(result, params);
                }
                processedReducers.push(reducerNode.name);
            } else {
                // Move it at the end of the queue
                reducersQueue.push(reducerNode);
            }
        } else {
            for (const result of root.results) {
                await reducerNode.compute(result, params);
            }

            processedReducers.push(reducerNode.name);
        }
    }
}
