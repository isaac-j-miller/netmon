export const getDomainBaseName = (domain: string): string => {
    const split = domain.split(".");
    return split.slice(split.length-2).join(".");
}