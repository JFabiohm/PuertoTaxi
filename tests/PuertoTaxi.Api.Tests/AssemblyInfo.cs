using Xunit;

// Cada clase de prueba crea su propia base de datos en LocalDB.
// Crear varias bases al mismo tiempo genera carreras (error 4060), así que
// ejecutamos las clases de forma secuencial.
[assembly: CollectionBehavior(DisableTestParallelization = true)]
