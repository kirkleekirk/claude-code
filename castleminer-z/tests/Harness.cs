using System;
using System.Collections.Generic;

namespace CastleMinerZ.Tests
{
    /// <summary>Tiny assertion harness. No test framework dependency to keep the build trivial.</summary>
    public static class Harness
    {
        private static int _passed;
        private static int _failed;
        private static string _currentSuite = "";
        private static readonly List<string> _failures = new List<string>();

        public static void Suite(string name)
        {
            _currentSuite = name;
            Console.WriteLine();
            Console.WriteLine("== " + name + " ==");
        }

        public static void Check(bool condition, string description)
        {
            if (condition)
            {
                _passed++;
                Console.WriteLine("  PASS  " + description);
            }
            else
            {
                _failed++;
                string message = _currentSuite + ": " + description;
                _failures.Add(message);
                Console.WriteLine("  FAIL  " + description);
            }
        }

        public static void CheckEqual(int expected, int actual, string description)
        {
            Check(expected == actual, description + " (expected " + expected + ", got " + actual + ")");
        }

        public static void CheckNear(float expected, float actual, float tolerance, string description)
        {
            float difference = Math.Abs(expected - actual);
            Check(difference <= tolerance,
                description + " (expected " + expected.ToString("0.###") + " +/- " + tolerance
                + ", got " + actual.ToString("0.###") + ")");
        }

        public static int Report()
        {
            Console.WriteLine();
            Console.WriteLine("---------------------------------------------");
            Console.WriteLine(_passed + " passed, " + _failed + " failed");

            if (_failed > 0)
            {
                Console.WriteLine();
                Console.WriteLine("Failures:");
                for (int i = 0; i < _failures.Count; i++) Console.WriteLine("  " + _failures[i]);
            }

            return _failed == 0 ? 0 : 1;
        }
    }
}
